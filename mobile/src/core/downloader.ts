/**
 * Getting the models onto the phone — the mobile counterpart of
 * backend/download_models.py.
 *
 * This is what turns the app from "works on the developer's phone" into something
 * anyone can install. Until now the weights were pushed over a cable; a fresh install
 * showed "models not downloaded" and could never get past it.
 *
 * Deliberate choices, each with a reason:
 *
 *  - **Continues in the background**, so locking the phone mid-download does not
 *    cancel it.
 *  - **Retryable per file, not per byte.** A failure keeps every file that already
 *    finished and restarts only the one that broke. Byte-level resume would need HTTP
 *    Range plus append, which this filesystem API cannot express, so the setup screen
 *    promises what is actually true rather than the stronger thing.
 *  - **Wi-Fi only by default.** Someone on a metered plan should not discover this app
 *    cost them a gigabyte of data. It is a switch, not a rule, and the setup screen
 *    says which way it is set.
 *  - **Verified by size before use.** A truncated GGUF does not fail cleanly, it fails
 *    weirdly at load. Each file is checked against its expected size, and anything
 *    short is deleted rather than left to confuse the next launch.
 *  - **Idempotent.** Anything already present and the right size is skipped, so
 *    reopening the screen after a partial run continues rather than restarting.
 */

import NetInfo from '@react-native-community/netinfo';
import { extractTarBz2 } from 'react-native-sherpa-onnx/download';
import {
  DocumentDirectoryPath,
  downloadFile,
  exists,
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';

import {
  ALL_TIERS,
  SUPPORT_MODELS,
  chosenTier,
  llmVariants,
  specsForTier,
  type ModelSpec,
  type Tier,
} from './model_tier';

export type Phase = 'checking' | 'downloading' | 'extracting' | 'verifying' | 'done' | 'error';

export type Progress = {
  phase: Phase;
  /** Which item of how many, for "2 of 3". */
  index: number;
  total: number;
  label: string;
  /** 0..1 for the current item. */
  fraction: number;
  bytesDone: number;
  bytesTotal: number;
  message?: string;
};

export type ProgressFn = (p: Progress) => void;

/** Anything under this fraction of the expected size is treated as truncated. */
const MIN_SIZE_RATIO = 0.98;

/** Written inside an extracted archive so a changed model is noticed. */
const VERSION_FILE = '.model-version';

/** The archive's own name, which is what actually identifies the model. */
function versionOf(spec: ModelSpec): string {
  return spec.url.split('/').pop() ?? spec.url;
}

/**
 * Is this connection one we are allowed to spend?
 *
 * downloadFile has no cellular switch of its own, so the promise is kept here: the
 * connection type is checked before a byte moves. Refusing loudly is the point —
 * silently spending 1.4 GB of someone's data plan is the failure this prevents, and an
 * unexplained refusal is nearly as bad.
 */
async function connectionAllowed(allowCellular: boolean): Promise<string | null> {
  try {
    const state = await NetInfo.fetch();
    if (!state.isConnected) return 'No connection. Join a network and try again.';
    if (!allowCellular && state.type === 'cellular') {
      return 'Waiting for Wi-Fi. Turn on "Download over mobile data" to use your data plan instead.';
    }
    return null;
  } catch {
    // If the connection cannot be read, let the download decide rather than blocking
    // on a check that itself failed.
    return null;
  }
}

function abs(rel: string): string {
  return `${DocumentDirectoryPath}/${rel}`;
}

function parentOf(p: string): string {
  return p.slice(0, p.lastIndexOf('/'));
}

/** Is this model already present and plausible? */
async function present(spec: ModelSpec): Promise<boolean> {
  const target = abs(spec.path);
  if (!(await exists(target))) return false;
  if (spec.archive) {
    // A directory: the marker files have to be there, not just the folder. An
    // interrupted extraction leaves the folder behind, and treating that as done is
    // how the app ends up loading half a voice.
    const need = ['model.onnx', 'tokens.txt', 'voices.bin', 'espeak-ng-data'];
    for (const f of need) {
      if (!(await exists(`${target}/${f}`))) return false;
    }
    // And it has to be the *right* archive. Kokoro v0.19 and v1.0 contain exactly the
    // same filenames, so a check on files alone passed for the old model and the new
    // one was never fetched: the voice fix shipped and changed nothing. The version
    // marker is written after extraction and compared here.
    try {
      const stamped = await readFile(`${target}/${VERSION_FILE}`, 'utf8');
      if (stamped.trim() !== versionOf(spec)) return false;
    } catch {
      return false; // no marker: an older install, so re-fetch
    }
    return true;
  }
  try {
    const s = await stat(target);
    return Number(s.size) >= spec.bytes * MIN_SIZE_RATIO;
  } catch {
    return false;
  }
}

/**
 * The language model this install will actually load.
 *
 * Preference decides what a fresh install fetches; the disk decides what an install
 * that already finished keeps using. A phone holding a working model must never be
 * sent back to the setup screen because the build changed its mind about which build
 * of that model it likes — that reads as the app losing a download it already made,
 * and every turn attempted meanwhile sits in "thinking" until the engine wait gives up.
 */
export async function chosenLlm(saved?: Tier | null): Promise<ModelSpec> {
  const variants = llmVariants(await chosenTier(saved));
  for (const spec of variants) {
    if (await present(spec)) {
      if (spec !== variants[0]) {
        console.log(
          `[model] using ${spec.path}, which is already on the device, rather than ` +
            `downloading ${variants[0].path}. Delete it from the models screen to ` +
            'fetch the preferred build.',
        );
      }
      return spec;
    }
  }
  return variants[0];
}

/** Everything this install needs on disk, with the language model resolved. */
export async function requiredModels(saved?: Tier | null): Promise<ModelSpec[]> {
  return [await chosenLlm(saved), ...SUPPORT_MODELS];
}

export async function modelsPresent(saved?: Tier | null): Promise<boolean> {
  for (const spec of await requiredModels(saved)) {
    if (!(await present(spec))) return false;
  }
  return true;
}

export async function missingModels(saved?: Tier | null): Promise<ModelSpec[]> {
  const out: ModelSpec[] = [];
  for (const spec of await requiredModels(saved)) {
    if (!(await present(spec))) out.push(spec);
  }
  return out;
}

/**
 * One file, resolving when it is on disk.
 *
 * Uses the filesystem module's own downloader rather than a dedicated background
 * download package. The package that would have given byte-level resume pulls in MMKV,
 * which does not compile against the iOS 26 SDK (`memset_s` undeclared in
 * AESCrypt.cpp), and patching someone else's C++ to gain resume on a one-time download
 * is the wrong trade. This is already linked and working.
 */
function fetchOne(
  spec: ModelSpec,
  destination: string,
  allowCellular: boolean,
  onProgress: (fraction: number, bytesDone: number, bytesTotal: number) => void,
): Promise<void> {
  const { promise } = downloadFile({
    fromUrl: spec.url,
    toFile: destination,
    // Keeps going when the phone is locked or the app is backgrounded.
    background: true,
    // false asks iOS to treat it as user-initiated, so it is not deferred to a
    // "convenient" time the user never sees.
    discretionary: false,
    cacheable: false,
    progressInterval: 250,
    begin: () => {},
    progress: ({ bytesWritten, contentLength }) => {
      const total = contentLength > 0 ? contentLength : spec.bytes;
      onProgress(total > 0 ? bytesWritten / total : 0, bytesWritten, total);
    },
  });

  return promise.then((res) => {
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      throw new Error(`HTTP ${res.statusCode}`);
    }
  });
}

/**
 * Language models on disk that are not the chosen one, with what they cost.
 *
 * Each model has its own file so switching back is instant, which means trying a few
 * leaves the others behind. This is what makes that recoverable.
 */
export async function unusedModels(saved?: Tier | null): Promise<
  Array<{ path: string; label: string; bytes: number }>
> {
  const keep = (await requiredModels(saved)).map((m) => m.path);
  const out: Array<{ path: string; label: string; bytes: number }> = [];
  for (const tier of ALL_TIERS) {
    for (const spec of specsForTier(tier)) {
      if (spec.archive || keep.includes(spec.path)) continue;
      if (out.some((o) => o.path === spec.path)) continue;
      const full = abs(spec.path);
      if (!(await exists(full))) continue;
      try {
        const s = await stat(full);
        out.push({ path: spec.path, label: spec.label, bytes: Number(s.size) });
      } catch {
        /* unreadable: leave it alone rather than guess */
      }
    }
  }
  return out;
}

/** Delete them. Returns how many bytes came back. */
export async function deleteUnused(saved?: Tier | null): Promise<number> {
  let freed = 0;
  for (const m of await unusedModels(saved)) {
    try {
      await unlink(abs(m.path));
      freed += m.bytes;
    } catch {
      /* already gone */
    }
  }
  return freed;
}

/** Nothing to reattach to with this downloader; kept so callers do not change. */
export async function reattach(): Promise<number> {
  return 0;
}

export type Options = {
  /** false lets it run on cellular too. Default is Wi-Fi only. */
  allowCellular?: boolean;
  savedTier?: Tier | null;
};

/**
 * Fetch everything missing. Safe to call again after a failure: what is already
 * present is skipped.
 */
export async function ensureModels(onProgress: ProgressFn, opts: Options = {}): Promise<void> {
  const allowCellular = opts.allowCellular === true;

  onProgress({
    phase: 'checking',
    index: 0,
    total: 0,
    label: 'Checking what you already have',
    fraction: 0,
    bytesDone: 0,
    bytesTotal: 0,
  });

  const refusal = await connectionAllowed(allowCellular);
  if (refusal) {
    onProgress({
      phase: 'error', index: 0, total: 0, label: 'Waiting',
      fraction: 0, bytesDone: 0, bytesTotal: 0, message: refusal,
    });
    throw new Error(refusal);
  }

  const missing = await missingModels(opts.savedTier);
  if (!missing.length) {
    onProgress({
      phase: 'done', index: 0, total: 0, label: 'Ready',
      fraction: 1, bytesDone: 0, bytesTotal: 0,
    });
    return;
  }

  const total = missing.length;
  for (let i = 0; i < total; i++) {
    const spec = missing[i];
    const index = i + 1;

    // Archives download to a temporary file beside where they unpack.
    const dest = spec.archive ? abs(`${spec.path}.tar.bz2`) : abs(spec.path);
    await mkdir(parentOf(dest)).catch(() => {});

    // Anything already at the destination that failed the presence check has to go
    // before the download starts. The downloader resumes by appending, so a file of
    // the wrong size — a truncated attempt, or a different model left by a previous
    // tier — would be treated as a partial download and resumed from its end,
    // producing a corrupt GGUF that only fails later, at load, confusingly.
    if (await exists(dest)) {
      await unlink(dest).catch(() => {});
    }

    onProgress({
      phase: 'downloading', index, total, label: spec.label,
      fraction: 0, bytesDone: 0, bytesTotal: spec.bytes,
    });

    try {
      await fetchOne(spec, dest, allowCellular, (fraction, bytesDone, bytesTotal) =>
        onProgress({
          phase: 'downloading', index, total, label: spec.label,
          fraction, bytesDone, bytesTotal,
        }),
      );
    } catch (err) {
      // A partial file left behind would be treated as present by a naive check and
      // fail strangely at load, so it goes.
      await unlink(dest).catch(() => {});
      const message = err instanceof Error ? err.message : String(err);
      onProgress({
        phase: 'error', index, total, label: spec.label,
        fraction: 0, bytesDone: 0, bytesTotal: spec.bytes,
        message,
      });
      throw err;
    }

    if (spec.archive) {
      onProgress({
        phase: 'extracting', index, total, label: spec.label,
        fraction: 0, bytesDone: 0, bytesTotal: spec.bytes,
      });
      await mkdir(abs(spec.path)).catch(() => {});
      const res = await extractTarBz2(dest, abs(spec.path), true, (evt: unknown) => {
        const e = evt as { progress?: number } | undefined;
        onProgress({
          phase: 'extracting', index, total, label: spec.label,
          fraction: typeof e?.progress === 'number' ? e.progress : 0,
          bytesDone: 0, bytesTotal: spec.bytes,
        });
      });
      if (!res?.success) {
        throw new Error(`Could not unpack ${spec.label}: ${res?.reason ?? 'unknown'}`);
      }
      // The archive is 300 MB and is no longer needed.
      await unlink(dest).catch(() => {});

      // sherpa archives unpack into a single folder; flatten it so the paths match
      // what models.ts expects rather than depending on the archive's own name.
      await flattenIfNested(abs(spec.path));
      await writeFile(`${abs(spec.path)}/${VERSION_FILE}`, versionOf(spec), 'utf8');
    }

    onProgress({
      phase: 'verifying', index, total, label: spec.label,
      fraction: 1, bytesDone: spec.bytes, bytesTotal: spec.bytes,
    });
    if (!(await present(spec))) {
      throw new Error(`${spec.label} finished but looks incomplete. Try again.`);
    }
  }

  onProgress({
    phase: 'done', index: total, total, label: 'Ready',
    fraction: 1, bytesDone: 0, bytesTotal: 0,
  });
}

/**
 * kokoro-en-v0_19.tar.bz2 unpacks to `kokoro-en-v0_19/…`, one level deeper than the
 * engine looks. Rather than hardcode that folder name, anything that ends up nested
 * is lifted up, so a future archive with a different name still works.
 */
async function flattenIfNested(dir: string): Promise<void> {
  const { readDir, moveFile } = await import('@dr.pogodin/react-native-fs');
  const entries = await readDir(dir);
  if (await exists(`${dir}/model.onnx`)) return; // already flat
  const inner = entries.find((e) => e.isDirectory());
  if (!inner) return;
  for (const item of await readDir(inner.path)) {
    await moveFile(item.path, `${dir}/${item.name}`).catch(() => {});
  }
  await unlink(inner.path).catch(() => {});
}
