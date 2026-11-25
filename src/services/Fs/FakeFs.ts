import { Glob } from "bun";
import type { Fs, GlobOptions } from "./Fs";

const normalise = (path: string) =>
  "/" + path.split("/").filter((part) => part !== "" && part !== ".").join("/");

const parents = (path: string) => {
  const parts = path.split("/").slice(1, -1);
  return parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
};

/**
 * An in-memory Fs: files a test starts with, and what's written, read back from memory.
 * A folder exists if `mkdir` made it, or a file is under it.
 */
export class FakeFs implements Fs {
  private readonly contents = new Map<string, Uint8Array>();
  private readonly folders = new Set<string>(["/"]);

  /** `initial` maps each absolute path to its text. */
  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.contents.set(normalise(path), new TextEncoder().encode(text));
  }

  async exists(path: string): Promise<boolean> {
    return this.contents.has(normalise(path));
  }

  async isDirectory(path: string): Promise<boolean> {
    const dir = normalise(path);
    return this.folders.has(dir) || [...this.contents.keys()].some((file) => file.startsWith(`${dir}/`));
  }

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(path));
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const bytes = this.contents.get(normalise(path));
    if (bytes === undefined) throw new Error(`no such file: ${path}`);
    return bytes.slice();
  }

  async write(path: string, data: string | Uint8Array): Promise<void> {
    this.contents.set(normalise(path), typeof data === "string" ? new TextEncoder().encode(data) : data.slice());
  }

  async mkdir(path: string): Promise<void> {
    const dir = normalise(path);
    for (const folder of [...parents(dir), dir]) this.folders.add(folder);
  }

  async remove(path: string): Promise<void> {
    this.contents.delete(normalise(path));
  }

  async copyDirectory(from: string, to: string): Promise<void> {
    const source = normalise(from);
    const dest = normalise(to);
    await this.mkdir(dest);
    for (const [file, bytes] of this.contents) {
      if (file.startsWith(`${source}/`)) this.contents.set(`${dest}${file.slice(source.length)}`, bytes.slice());
    }
  }

  async removeDirectory(path: string): Promise<void> {
    const dir = normalise(path);
    for (const file of this.contents.keys()) if (file.startsWith(`${dir}/`)) this.contents.delete(file);
    for (const folder of this.folders) if (folder === dir || folder.startsWith(`${dir}/`)) this.folders.delete(folder);
  }

  glob(pattern: string, { cwd, onlyFiles = true, dot = false }: GlobOptions): string[] {
    const base = normalise(cwd);
    const prefix = base === "/" ? "/" : `${base}/`;
    const entries = new Set<string>();
    for (const file of this.contents.keys()) {
      if (!file.startsWith(prefix)) continue;
      entries.add(file);
      if (!onlyFiles) for (const folder of parents(file)) if (folder.startsWith(prefix)) entries.add(folder);
    }
    if (!onlyFiles) for (const folder of this.folders) if (folder.startsWith(prefix)) entries.add(folder);
    const glob = new Glob(pattern);
    return [...entries]
      .map((entry) => entry.slice(prefix.length))
      .filter((relative) => (dot || !relative.split("/").some((part) => part.startsWith("."))) && glob.match(relative))
      .sort();
  }

  /** Every file and its text, sorted by path, for asserting on what was written. */
  files(): Record<string, string> {
    const decoder = new TextDecoder();
    return Object.fromEntries([...this.contents.keys()].sort().map((path) => [path, decoder.decode(this.contents.get(path))]));
  }
}
