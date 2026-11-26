/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhzk1BgPsDT4k7aD6J
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
// Which files the agent read, as far as its tool calls show. A read tool names its file; a shell
// command is read word by word, for a program that prints or searches a file followed by the file.
// So it misses a read it can't see, e.g. a script that opens the file, or a glob such as `cat *.md`:
// a file not found is "no read Thunderjar recognises", not "never read".
import type { ToolCall } from "../../api/declarations.ts";
import { type Instrument, show } from "../instrument.ts";

/** Programs that show the agent a file's content, or search it, when given its path. */
const READERS = new Set(["cat", "head", "tail", "less", "more", "sed", "awk", "grep", "egrep", "fgrep", "rg", "ag", "nl", "bat", "batcat", "tac", "jq", "diff", "cut", "sort", "uniq", "xxd", "od", "strings"]);

/** Shells, which `-c` hands a command to: Codex runs each of its commands as `bash -lc "…"`. */
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

const basename = (word: string) => word.slice(word.lastIndexOf("/") + 1);

/** `path` as an absolute path, from `cwd` if it's relative, with `.` and `..` resolved. Undefined for a path from `~`, whose home isn't known. */
export function resolvePath(cwd: string, path: string): string | undefined {
  if (path.startsWith("~")) return undefined;
  const parts: string[] = [];
  for (const part of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/**
 * The files `command`, run in `cwd`, reads, as absolute paths: each word after a reader, e.g.
 * `cat` or `grep`, that isn't a flag, a glob or a variable, and each file redirected in with `<`.
 * A `cd` changes the folder for what follows it. Quotes are dropped, not parsed, so a quoted
 * argument with a space in it is read as two words.
 */
export function shellReads(command: string, cwd: string): string[] {
  const reads: string[] = [];
  const add = (path: string | undefined) => path !== undefined && reads.push(path);
  let dir = cwd;
  const unquoted = command.replace(/\d*>&\d+/g, " ").replace(/\\\n/g, " ").replace(/["']/g, "");
  for (const segment of unquoted.split(/&&|\|\||[|;&\n]/)) {
    const words = segment.match(/>>|[<>]|[^\s<>]+/g) ?? [];
    while (words.length >= 2 && SHELLS.has(basename(words[0] as string)) && /^-\w*c\w*$/.test(words[1] as string)) words.splice(0, 2);
    if (words[0] === "cd") {
      if (words[1] !== undefined) dir = resolvePath(dir, words[1]) ?? dir;
      continue;
    }
    const reader = words.findIndex((word) => READERS.has(basename(word)));
    for (let i = 0; i < words.length; i++) {
      const word = words[i] as string;
      if (word === ">" || word === ">>" || word === "<") {
        if (word === "<" && words[i + 1] !== undefined) add(resolvePath(dir, words[i + 1] as string));
        i++;
        continue;
      }
      if (reader === -1 || i <= reader || word.startsWith("-") || /[*?[\]{}$`]/.test(word)) continue;
      add(resolvePath(dir, word));
    }
  }
  return reads;
}

/**
 * The files `calls` read, as absolute paths, relative ones from `workdir`: each path a `read` or
 * `search` call names, and each file a `shell` call's command reads, in the folder it ran in.
 */
export function filesRead(calls: ToolCall[], workdir: string): string[] {
  return calls.flatMap((call) => {
    if (call.kind === "read" || call.kind === "search") return call.paths.flatMap((path) => resolvePath(workdir, path) ?? []);
    if (call.kind === "shell" && call.command !== undefined) return shellReads(call.command, (call.cwd !== undefined && resolvePath(workdir, call.cwd)) || workdir);
    return [];
  });
}

/**
 * Whether the agent read a file matching each of `paths`, a path or glob, relative to the
 * workdir or absolute, as its harness's `collectToolCalls` read them: `{ [path]: boolean }`.
 * `skipped`, saying why, when the tool calls can't be read.
 */
export const fileRead: Instrument<{ paths: string[] }, Record<string, boolean>> = {
  version: 1,
  async evaluate({ paths }, ctx) {
    const read = await ctx.toolCalls();
    if (read.outcome !== "collected") return { outcome: "skipped", reason: `no tool calls to read: ${read.reason}` };
    const files = filesRead(read.calls, ctx.workdir);
    return {
      outcome: "measured",
      data: Object.fromEntries(
        paths.map((path) => {
          const glob = new Bun.Glob(resolvePath(ctx.workdir, path) as string);
          return [path, files.some((file) => glob.match(file))];
        }),
      ),
    };
  },
  checkConfig(config) {
    const { paths } = (config ?? {}) as { paths?: unknown };
    const ok = Array.isArray(paths) && paths.length > 0 && paths.every((path) => typeof path === "string" && path !== "" && !path.startsWith("~"));
    return ok ? [] : [["config.paths", `must be a list of paths or globs, relative to the workdir or absolute, at least one, got ${show(paths)}`]];
  },
};
