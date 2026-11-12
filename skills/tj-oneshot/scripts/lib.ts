/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// Shared by start.ts and stop.ts: git calls, tag names and transcript reading.

export const TAG_PREFIX = "thunderjar/oneshot";

export type Kind = "start" | "end";

export function tagName(sessionId: string, kind: Kind): string {
  return `${TAG_PREFIX}/${sessionId}/${kind}`;
}

// --- git ---

type GitResult = { exitCode: number; stdout: string; stderr: string };

function runGit(cwd: string, args: string[], stdin?: string): GitResult {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

/** Runs git and returns its output. Throws when git fails. */
export function git(cwd: string, args: string[], stdin?: string): string {
  const result = runGit(cwd, args, stdin);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return result.stdout;
}

/** Runs git and returns its output, or null when git fails, e.g. `rev-parse HEAD` in an empty repo. */
export function tryGit(cwd: string, args: string[]): string | null {
  const result = runGit(cwd, args);
  return result.exitCode === 0 ? result.stdout : null;
}

export function tagExists(cwd: string, tag: string): boolean {
  return runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`]).exitCode === 0;
}

/**
 * Commits everything in the working tree, tracked or not, and returns the new commit.
 * The commit is empty when there is nothing to commit.
 * `--no-verify` skips the repo's commit hooks, so a lint failure can't lose the record.
 */
export function commitEverything(cwd: string, message: string): string {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "--allow-empty", "--no-verify", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

/** Creates an annotated tag whose message is a title line, a blank line, then the record as JSON. */
export function writeTag(cwd: string, tag: string, commit: string, title: string, record: unknown) {
  const message = `${title}\n\n${JSON.stringify(record, null, 2)}\n`;
  git(cwd, ["tag", "--annotate", "--cleanup=verbatim", tag, commit, "--file", "-"], message);
}

/** Reads the JSON record back out of a tag written by `writeTag`. */
export function readTag(cwd: string, tag: string): unknown {
  const message = git(cwd, ["tag", "--list", "--format=%(contents)", tag]);
  return JSON.parse(message.slice(message.indexOf("{")));
}

// --- transcript ---

export type TranscriptEntry = {
  type?: string;
  version?: string;
  entrypoint?: string;
  permissionMode?: string | null;
  message?: { model?: string; content?: unknown };
};

/** Finds a Claude Code session's transcript, e.g. `~/.claude/projects/<project>/<session>.jsonl`. */
export function findTranscript(sessionId: string): string | null {
  const configDir = Bun.env.CLAUDE_CONFIG_DIR ?? `${Bun.env.HOME}/.claude`;
  const glob = new Bun.Glob(`projects/*/${sessionId}.jsonl`);
  for (const path of glob.scanSync({ cwd: configDir, absolute: true })) {
    return path;
  }
  return null;
}

/** Reads a transcript, one JSON object per line. Skips lines that don't parse, e.g. one still being written. */
export async function readTranscript(path: string): Promise<TranscriptEntry[]> {
  const text = await Bun.file(path).text();
  const entries: TranscriptEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A partly written last line.
    }
  }
  return entries;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (block && typeof block === "object" && "text" in block ? String(block.text) : ""))
      .join("\n");
  }
  return "";
}

// e.g. <command-name>/tj-oneshot</command-name>, or /thunderjar:tj-oneshot when installed from a plugin.
const COMMAND_NAME = /<command-name>\/(?:[\w.-]+:)?tj-oneshot<\/command-name>/;
const COMMAND_ARGS = /<command-args>([\s\S]*)<\/command-args>/;

/**
 * The text the user typed after `/tj-oneshot`, exactly as the harness recorded it.
 * Takes the latest invocation, in case the skill was run more than once in a session.
 */
export function findOneshotPrompt(entries: TranscriptEntry[]): string | null {
  for (const entry of entries.toReversed()) {
    if (entry.type !== "user") continue;
    const text = textOf(entry.message?.content);
    if (!COMMAND_NAME.test(text)) continue;
    return text.match(COMMAND_ARGS)?.[1] ?? "";
  }
  return null;
}

/** The models that answered in the session, in order of first use. */
export function modelsOf(entries: TranscriptEntry[]): string[] {
  const models = entries
    .filter((entry) => entry.type === "assistant")
    .map((entry) => entry.message?.model)
    .filter((model): model is string => !!model && model !== "<synthetic>");
  return [...new Set(models)];
}

/** The last value of a top-level transcript field, e.g. `version` or `entrypoint`. */
export function lastField(entries: TranscriptEntry[], field: "version" | "entrypoint" | "permissionMode"): string | null {
  for (const entry of entries.toReversed()) {
    const value = entry[field];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
