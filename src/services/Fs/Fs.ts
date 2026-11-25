import { $, Glob } from "bun";

export type GlobOptions = {
  /** The folder the pattern is matched in, and the results are relative to. */
  cwd: string;
  /** Lists folders too. Files only by default. */
  onlyFiles?: boolean;
  /** Matches names starting with `.`. Not by default. */
  dot?: boolean;
};

/** The filesystem, so a test can pass a FakeFs in its place. Paths are absolute. */
export interface Fs {
  /** Whether a file is at `path`. False for a folder. */
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  /** Rejects if there's no file at `path`. */
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  /** Writes the file, replacing any, and makes its missing folders. */
  write(path: string, data: string | Uint8Array): Promise<void>;
  /** Makes the folder, and its missing parents. */
  mkdir(path: string): Promise<void>;
  /** Deletes the file, if there is one. */
  remove(path: string): Promise<void>;
  /**
   * Copies what's in the folder `from` into the folder `to`, making `to`: files of the same name are
   * replaced, and a symlink is copied as what it points to. Does nothing if `from` is missing.
   */
  copyDir(from: string, to: string): Promise<void>;
  /** Deletes the folder and everything in it, if it's there. */
  removeDir(path: string): Promise<void>;
  /** The paths under `cwd` matching `pattern`, sorted, relative to `cwd`. None if `cwd` is missing. */
  glob(pattern: string, options: GlobOptions): string[];
}

/** The real filesystem. Built only at an entry point. */
export function createFsService(): Fs {
  const isDirectory = (path: string) => Bun.file(path).stat().then((stat) => stat.isDirectory(), () => false);
  return {
    exists: (path) => Bun.file(path).exists(),
    isDirectory,
    readText: (path) => Bun.file(path).text(),
    readBytes: (path) => Bun.file(path).bytes(),
    write: async (path, data) => void (await Bun.write(path, data)),
    mkdir: async (path) => void (await $`mkdir -p ${path}`.quiet()),
    remove: async (path) => {
      const file = Bun.file(path);
      if (await file.exists()) await file.delete();
    },
    copyDir: async (from, to) => {
      if (!(await isDirectory(from))) return;
      await $`mkdir -p ${to}`.quiet();
      // `from/.` copies the contents, dotfiles included, not the folder itself.
      await $`cp -RL ${`${from}/.`} ${to}`.quiet();
    },
    removeDir: async (path) => void (await $`rm -rf ${path}`.quiet()),
    glob(pattern, { cwd, onlyFiles = true, dot = false }) {
      try {
        return [...new Glob(pattern).scanSync({ cwd, onlyFiles, dot })].sort();
      } catch {
        return [];
      }
    },
  };
}
