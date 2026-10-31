// Filesystem helpers built on Bun's APIs and shell, in place of node:fs and node:os, which this
// repository doesn't use (see AGENTS.md). For reading and writing files, use Bun.file and
// Bun.write directly; Bun.write creates missing parent directories.

import { $ } from "bun";
import { join } from "./path.ts";

export function tmpdir(): string {
  return (Bun.env.TMPDIR ?? "/tmp").replace(/\/+$/, "") || "/";
}

export function homedir(): string {
  return Bun.env.HOME ?? "/";
}

/** A new, empty directory under `tmpdir()`, whose name starts with `prefix`. */
export async function makeTempDir(prefix: string): Promise<string> {
  return (await $`mktemp -d ${join(tmpdir(), `${prefix}XXXXXX`)}`.quiet().text()).trim();
}

/** Creates `dir` and any missing parents. */
export async function makeDir(dir: string): Promise<void> {
  await $`mkdir -p ${dir}`.quiet();
}

/** Deletes `path`, recursively. Nothing happens if it doesn't exist. */
export async function remove(path: string): Promise<void> {
  await $`rm -rf ${path}`.quiet();
}

/**
 * Copies `from` to `to`, recursively, keeping symlinks as they are. A directory is copied to
 * `to` itself, as node's `cp(from, to, { recursive: true })`, not into it.
 */
export async function copy(from: string, to: string): Promise<void> {
  if (await isDirectory(from)) {
    await makeDir(to);
    await $`cp -RP ${from}/. ${to}`.quiet();
  } else {
    await $`cp -P ${from} ${to}`.quiet();
  }
}

export async function move(from: string, to: string): Promise<void> {
  await $`mv -f ${from} ${to}`.quiet();
}

export async function symlink(target: string, path: string): Promise<void> {
  await $`ln -s ${target} ${path}`.quiet();
}

export async function exists(path: string): Promise<boolean> {
  return (await $`test -e ${path}`.quiet().nothrow()).exitCode === 0;
}

export async function isDirectory(path: string): Promise<boolean> {
  return (await $`test -d ${path}`.quiet().nothrow()).exitCode === 0;
}

export async function isFile(path: string): Promise<boolean> {
  return (await $`test -f ${path}`.quiet().nothrow()).exitCode === 0;
}

export function existsSync(path: string): boolean {
  return Bun.spawnSync(["test", "-e", path]).exitCode === 0;
}

export function isDirectorySync(path: string): boolean {
  return Bun.spawnSync(["test", "-d", path]).exitCode === 0;
}

/** The text of the file at `path`, for code that can't wait: prefer `Bun.file(path).text()`. */
export function readTextSync(path: string): string {
  const result = Bun.spawnSync(["cat", "--", path], { stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`can't read ${path}: ${result.stderr.toString().trim()}`);
  return result.stdout.toString();
}

export type DirEntry = { path: string; isDirectory: boolean };

/**
 * What `dir` contains, sorted, as paths relative to `dir`, hidden entries included. With
 * `recursive`, the contents of its subdirectories too.
 */
export function listEntries(dir: string, { recursive = false } = {}): DirEntry[] {
  if (!isDirectorySync(dir)) throw new Error(`not a directory: ${dir}`);
  const pattern = new Bun.Glob(recursive ? "**" : "*");
  const scan = (onlyFiles: boolean) => [...pattern.scanSync({ cwd: dir, dot: true, onlyFiles, followSymlinks: false })];
  const files = new Set(scan(true));
  // Symlinks aren't in `files`; like node's Dirent, a symlink isn't a directory.
  const isRealDirectory = (path: string) =>
    Bun.spawnSync(["sh", "-c", 'test -d "$1" && test ! -L "$1"', "sh", join(dir, path)]).exitCode === 0;
  return scan(false)
    .toSorted()
    .map((path) => ({ path, isDirectory: !files.has(path) && isRealDirectory(path) }));
}

/** `listEntries`, as paths only. */
export function listDir(dir: string, options: { recursive?: boolean } = {}): string[] {
  return listEntries(dir, options).map((entry) => entry.path);
}
