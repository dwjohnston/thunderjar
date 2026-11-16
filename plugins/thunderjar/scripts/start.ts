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
  addPending,
  captureEnabled,
  harnessFromEnv,
  logError,
  readTranscript,
  refExists,
  refName,
  snapshot,
  tryGit,
  versionOf,
  writeRecord,
  verboseLogger,
  type StartRecord,
} from "./lib.ts";

function help() {
  console.log(`
Capture a prompt. Runs as the plugin's UserPromptSubmit hook, which passes the
hook input as JSON on stdin.

Does nothing unless THUNDERJAR_CAPTURE=1 and the folder is in a git repository.
Then, before the agent sees the prompt:
  - On the session's first prompt, snapshots the working tree, untracked files
    included, as a commit on no branch, and points
    refs/thunderjar/capture/<session>/start at an annotated tag for it, whose
    message holds the prompt and details as JSON.
  - On a later prompt, leaves it in <git-dir>/thunderjar/<session>/pending.json
    for the Stop hook.

The branch, the index and the working tree are left as they are. It never
blocks the prompt: errors go to <git-dir>/thunderjar/capture.log, and so does
each step with THUNDERJAR_CAPTURE_LOG_LEVEL=verbose (default: none). It prints
nothing on stdout, which Claude Code would add to the agent's context.

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
  if (captureEnabled(Bun.env)) {
    let input: PromptInput | undefined;
    try {
      input = JSON.parse(await Bun.stdin.text()) as PromptInput;
      await main(input, Bun.env);
    } catch (error) {
      await logError(input?.cwd ?? process.cwd(), "start", error);
    }
  }
}

export type StartResult =
  | { captured: "nothing" }
  | { captured: "start"; ref: string; commit: string; record: StartRecord }
  | { captured: "pending" };

export async function main(input: PromptInput, env: Record<string, string | undefined>): Promise<StartResult> {
  if (!captureEnabled(env)) return { captured: "nothing" };
  const log = verboseLogger(input.cwd, "start", env);
  log(`session ${input.session_id}, cwd ${input.cwd}`);
  const root = tryGit(input.cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) return { captured: "nothing" };

  const sessionId = input.session_id;
  const ref = refName(sessionId, "start");
  if (refExists(root, ref)) {
    await addPending(root, sessionId, input.prompt);
    log(`${ref} exists: prompt (${input.prompt.length} chars) added to pending`);
    return { captured: "pending" };
  }

  const entries = await readTranscript(input.transcript_path);
  const harness = harnessFromEnv(env);
  const headAtStart = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const branch = tryGit(root, ["branch", "--show-current"]) || null;
  log(`first prompt: branch ${branch ?? "(detached)"}, HEAD ${headAtStart ?? "(none)"}, ${entries.length} transcript entries`);
  const { commit, dirty } = await snapshot(root, headAtStart, `thunderjar capture: ${sessionId} start\n`);
  log(`snapshot ${commit}${dirty ? " (dirty)" : ""}`);

  const record: StartRecord = {
    schemaVersion: 1,
    kind: "start",
    capturedAt: new Date().toISOString(),
    prompt: input.prompt,
    agent: {
      harness: "Claude Code",
      harnessVersion: harness.harnessVersion ?? versionOf(entries),
      harnessSurface: harness.harnessSurface,
      effort: harness.effort,
      sessionId,
      transcriptPath: input.transcript_path ?? null,
      permissionMode: input.permission_mode ?? null,
    },
    repository: { root, branch, headAtStart, dirty },
  };
  const tag = writeRecord(root, ref, commit, record);
  log(`wrote ${ref} -> tag ${tag}`);
  return { captured: "start", ref, commit, record };
}
