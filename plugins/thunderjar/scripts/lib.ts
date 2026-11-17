/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// Shared by the start and stop hooks: git calls, tag names, the prompt, and harness details.

export const TAG_PREFIX = "thunderjar/oneshot";

export type Kind = "start" | "end";

export function tagName(sessionId: string, kind: Kind): string {
  return `${TAG_PREFIX}/${sessionId}/${kind}`;
}

// --- prompt ---

// e.g. "/tj-oneshot Add a flag", or "/thunderjar:tj-oneshot Add a flag" with the plugin's namespace.
const ONESHOT_COMMAND = /^\s*\/(?:[\w.-]+:)?tj-oneshot(?=\s|$)/;

/**
 * The task the user gave after `/tj-oneshot`, exactly as typed apart from the whitespace after the command.
 * Null when the prompt isn't a `/tj-oneshot` command.
 */
export function parseOneshotPrompt(typed: string): string | null {
  const match = typed.match(ONESHOT_COMMAND);
  if (!match) return null;
  return typed.slice(match[0].length).replace(/^\s+/, "");
}

// --- harness ---

/**
 * Details Claude Code puts in a hook's environment. `AI_AGENT` looks like `claude-code_2-1-322_harness`;
 * it isn't documented, so the transcript is the fallback for the version.
 */
export function harnessFromEnv(env: Record<string, string | undefined>) {
  const version = env.AI_AGENT?.match(/^claude-code_(\d+(?:-\d+)*)_/)?.[1]?.replaceAll("-", ".") ?? null;
  return {
    harnessVersion: version,
    harnessSurface: env.CLAUDE_CODE_ENTRYPOINT || null,
    effort: env.CLAUDE_EFFORT || null,
  };
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
  message?: { model?: string };
};

/** Reads a session transcript, one JSON object per line. Empty when there's no file yet. */
export async function readTranscript(path: string | undefined): Promise<TranscriptEntry[]> {
  if (!path || !(await Bun.file(path).exists())) return [];
  const entries: TranscriptEntry[] = [];
  for (const line of (await Bun.file(path).text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A partly written last line.
    }
  }
  return entries;
}

/** The models that answered in the session, in order of first use. */
export function modelsOf(entries: TranscriptEntry[]): string[] {
  const models = entries
    .filter((entry) => entry.type === "assistant")
    .map((entry) => entry.message?.model)
    .filter((model): model is string => !!model && model !== "<synthetic>");
  return [...new Set(models)];
}

/** The harness version from the transcript, for when the environment doesn't have it. */
export function versionOf(entries: TranscriptEntry[]): string | null {
  return entries.findLast((entry) => entry.version)?.version ?? null;
}
