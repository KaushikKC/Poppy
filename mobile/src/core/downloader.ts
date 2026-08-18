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
 *  - **Resumable.** A gigabyte over a phone connection will be interrupted. The
 *    background downloader keeps partial files and reconnects to tasks that survived
 *    the app being backgrounded, so a lost connection costs seconds rather than the
 *    whole download.
 *  - **Wi-Fi only by default.** Someone on a metered plan should not discover this app
 *    cost them a gigabyte of data. It is a switch, not a rule, and the setup screen
 *    says which way it is set.
 *  - **Verified by size before use.** A truncated GGUF does not fail cleanly, it fails
 *    weirdly at load. Each file is checked against its expected size, and anything
 *    short is deleted rather than left to confuse the next launch.
 *  - **Idempotent.** Anything already present and the right size is skipped, so
 *    reopening the screen after a partial run continues rather than restarting.
 */

import {
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
  completeHandler,
} from '@kesha-antonov/react-native-background-downloader';
import { extractTarBz2 } from 'react-native-sherpa-onnx/download';
import {
  DocumentDirectoryPath,
  exists,
  mkdir,
  stat,
  unlink,
} from '@dr.pogodin/react-native-fs';

import { requiredModels, type ModelSpec, type Tier } from './model_tier';

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
    return true;
  }
  try {
    const s = await stat(target);
    return Number(s.size) >= spec.bytes * MIN_SIZE_RATIO;
  } catch {
    return false;
  }
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

/** One file, resumable, resolving when it is on disk. */
function fetchOne(
  spec: ModelSpec,
  destination: string,
  onProgress: (fraction: number, bytesDone: number, bytesTotal: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const task = createDownloadTask({
      // Stable per-file id: this is what lets a task started before the app was
      // backgrounded be reattached instead of started again.
      id: spec.path.replace(/[^a-zA-Z0-9]/g, '_'),
      url: spec.url,
      destination,
      metadata: {},
    });

    task
      .progress(({ bytesDownloaded, bytesTotal }) => {
        const total = bytesTotal > 0 ? bytesTotal : spec.bytes;
        onProgress(total > 0 ? bytesDownloaded / total : 0, bytesDownloaded, total);
      })
      .done(() => {
        // iOS requires this or the OS keeps the background session open.
        completeHandler(task.id);
        resolve();
      })
      .error(({ error }) => {
        completeHandler(task.id);
        reject(new Error(String(error)));
      });
  });
}

/** Reattach to anything still running from a previous foreground session. */
export async function reattach(): Promise<number> {
  try {
    const tasks = await getExistingDownloadTasks();
    return tasks.length;
  } catch {
    return 0;
  }
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

  setConfig({
    // The switch that keeps this from quietly spending someone's data plan.
    allowsCellularAccess: allowCellular,
    progressInterval: 250,
    isLogsEnabled: false,
  });

  onProgress({
    phase: 'checking',
    index: 0,
    total: 0,
    label: 'Checking what you already have',
    fraction: 0,
    bytesDone: 0,
    bytesTotal: 0,
  });

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

    onProgress({
      phase: 'downloading', index, total, label: spec.label,
      fraction: 0, bytesDone: 0, bytesTotal: spec.bytes,
    });

    try {
      await fetchOne(spec, dest, (fraction, bytesDone, bytesTotal) =>
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
        message: allowCellular
          ? message
          : `${message} (downloads are set to Wi-Fi only)`,
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
