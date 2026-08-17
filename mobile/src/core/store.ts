/**
 * JSON persistence, mirroring how desktop stores state on disk.
 *
 * Desktop keeps the profile and companion state in JSON files under a data
 * directory. Doing the same here keeps the port honest: the same shapes, the same
 * read-modify-write semantics, and a file that can be inspected when something
 * looks wrong.
 *
 * The filesystem is injectable so the core can be exercised on a Mac in plain
 * node, without a simulator. Every module in the port is testable that way, which
 * is the only reason porting 4,000 lines of tested Python is mechanical rather
 * than a leap of faith.
 */

export type Fs = {
  read: (path: string) => Promise<string | null>;
  write: (path: string, data: string) => Promise<void>;
  mkdirp: (path: string) => Promise<void>;
};

let fs: Fs | null = null;
let root = '';

export function configureStore(impl: Fs, dataRoot: string): void {
  fs = impl;
  root = dataRoot;
}

function required(): Fs {
  if (!fs) throw new Error('store not configured: call configureStore() at startup');
  return fs;
}

function pathFor(name: string): string {
  return `${root}/${name}`;
}

/** Read a JSON file, or `fallback` when it is absent or unparseable. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const raw = await required().read(pathFor(name));
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A truncated write (killed mid-save) should not brick the app. Desktop has
    // the same forgiveness, and losing state is better than refusing to start.
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  const impl = required();
  await impl.mkdirp(root);
  await impl.write(pathFor(name), JSON.stringify(value, null, 2));
}

/** An in-memory filesystem, for tests and for the first run before RNFS is up. */
export function memoryFs(): Fs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (p) => (files.has(p) ? (files.get(p) as string) : null),
    write: async (p, d) => {
      files.set(p, d);
    },
    mkdirp: async () => {},
  };
}
