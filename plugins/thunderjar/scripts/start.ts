#!/usr/bin/env bun
/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

import {
  commitEverything,
  harnessFromEnv,
  modelsOf,
  parseOneshotPrompt,
  readTranscript,
  tagExists,
  tagName,
  tryGit,
  versionOf,
  writeTag,
} from "./lib.ts";

function help() {
  console.log(`
Record the start of a one-shot task. Runs as the plugin's UserPromptSubmit
hook, which passes the hook input as JSON on stdin.

Does nothing unless the prompt is a /tj-oneshot command. Otherwise, before the
agent sees the prompt:
  1. Commits everything in the working tree, including untracked files, as
     "🎯 tj-oneshot start: <session>". The commit is empty when the tree is clean.
  2. Tags it with the annotated tag thunderjar/oneshot/<session>/start, whose
     message holds the prompt and the agent and repository details as JSON.

If it can't record the start, it blocks the prompt and tells the user why, so
an unrecorded one-shot never runs.

Nothing is printed on stdout on success: Claude Code would add it to the
agent's context.

Usage:
  echo '<hook input>' | bun start.ts

Options:
  -h, --help   Show this message
`);
}

export type PromptInput = {
  session_id: string;
  transcript_path?: string;
  cwd: string;
  permission_mode?: string;
  prompt: string;
};

if (import.meta.main) {
  if (Bun.argv.includes("-h") || Bun.argv.includes("--help")) {
    help();
    process.exit(0);
  }
  const input = JSON.parse(await Bun.stdin.text()) as PromptInput;
  try {
    await main(input, Bun.env);
  } catch (error) {
    const reason = `tj-oneshot: ${error instanceof Error ? error.message : error}`;
    console.log(JSON.stringify({ decision: "block", reason }));
  }
}

export async function main(input: PromptInput, env: Record<string, string | undefined>) {
  const task = parseOneshotPrompt(input.prompt);
  if (task === null) return { started: false as const };
  if (!task.trim()) {
    throw new Error("Give the task after the command, e.g. /tj-oneshot Add a --verbose flag to the CLI.");
  }

  const sessionId = input.session_id;
  const root = tryGit(input.cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) throw new Error(`${input.cwd} isn't in a git repository, so the one-shot can't be recorded.`);
  const tag = tagName(sessionId, "start");
  if (tagExists(root, tag)) {
    throw new Error("This session already has a one-shot. Start a new session for another.");
  }

  const entries = await readTranscript(input.transcript_path);
  const harness = harnessFromEnv(env);
  const headBeforeStart = tryGit(root, ["rev-parse", "HEAD"]);
  const branch = tryGit(root, ["branch", "--show-current"]) || null;
  const commit = commitEverything(root, `🎯 tj-oneshot start: ${sessionId}`);

  const record = {
    schemaVersion: 1,
    kind: "start",
    capturedAt: new Date().toISOString(),
    prompt: { text: task, typed: input.prompt, verbatim: true },
    agent: {
      harness: "Claude Code",
      harnessVersion: harness.harnessVersion ?? versionOf(entries),
      harnessSurface: harness.harnessSurface,
      // Only known when the session has had an earlier turn. The end tag always has it.
      model: modelsOf(entries).at(-1) ?? null,
      effort: harness.effort,
      sessionId,
      transcriptPath: input.transcript_path ?? null,
      permissionMode: input.permission_mode ?? null,
    },
    repository: { root, branch, headBeforeStart, startCommit: commit },
  };
  writeTag(root, tag, commit, `tj-oneshot start: ${sessionId}`, record);
  return { started: true as const, tag, commit, record };
}
