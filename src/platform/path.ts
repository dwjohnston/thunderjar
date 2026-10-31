// POSIX path functions, in place of node:path, which this repository doesn't use (see AGENTS.md).

export const sep = "/";

export function isAbsolute(path: string): boolean {
  return path.startsWith("/");
}

/** `path` with `.`, `..` and repeated slashes resolved, as node's `path.posix.normalize`. */
export function normalize(path: string): string {
  if (path === "") return ".";
  const absolute = isAbsolute(path);
  const trailing = path.endsWith("/");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out.at(-1) !== "..") out.pop();
      else if (!absolute) out.push("..");
    } else out.push(part);
  }
  let result = (absolute ? "/" : "") + out.join("/");
  if (result === "") result = absolute ? "/" : ".";
  if (trailing && !result.endsWith("/")) result += "/";
  return result;
}

export function join(...parts: string[]): string {
  const joined = parts.filter((part) => part !== "").join("/");
  return joined === "" ? "." : normalize(joined);
}

/** An absolute path: `parts` resolved right to left from the current directory. */
export function resolve(...parts: string[]): string {
  let path = "";
  for (let i = parts.length - 1; i >= 0 && !isAbsolute(path); i--) {
    const part = parts[i]!;
    if (part !== "") path = path === "" ? part : `${part}/${path}`;
  }
  if (!isAbsolute(path)) path = `${process.cwd()}/${path}`;
  const normal = normalize(path);
  return normal.length > 1 && normal.endsWith("/") ? normal.slice(0, -1) : normal;
}

export function relative(from: string, to: string): string {
  const a = resolve(from).split("/").filter(Boolean);
  const b = resolve(to).split("/").filter(Boolean);
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return [...Array<string>(a.length - common).fill(".."), ...b.slice(common)].join("/");
}

export function dirname(path: string): string {
  if (path === "") return ".";
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const at = trimmed.lastIndexOf("/");
  if (at === -1) return ".";
  if (at === 0) return "/";
  return trimmed.slice(0, at);
}

export function basename(path: string, ext?: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const base = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return ext && base !== ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

export function extname(path: string): string {
  const base = basename(path);
  const at = base.lastIndexOf(".");
  return at <= 0 ? "" : base.slice(at);
}
