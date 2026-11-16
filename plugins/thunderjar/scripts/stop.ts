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
  captureEnabled,
  clearPending,
  git,
  gitSucceeds,
  harnessFromEnv,
  logError,
  modelsOf,
  nextTurn,
  readPending,
  readRecord,
  readTranscript,
  refExists,
  refName,
  snapshot,
  tryGit,
  versionOf,
  writeRecord,
  verboseLogger,
  type StartRecord,
  type TurnRecord,
} from "./lib.ts";

function help() {
  console.log(`
Capture the end of a turn. Runs as the plugin's Stop hook, which passes the
hook input as JSON on stdin.

Does nothing unless THUNDERJAR_CAPTURE=1 and the session has a start ref.
Then it snapshots the working tree, untracked files included, as a commit on
no branch whose parent is the current HEAD, and points
refs/thunderjar/capture/<session>/turn-<n> at an annotated tag for it, whose
message holds the turn's prompt, the agent's commits, the files left
uncommitted and more, as JSON.

The branch, the index and the working tree are left as they are. It doesn't
push, and always exits 0: errors go to <git-dir>/thunderjar/capture.log, and
so does each step with THUNDERJAR_CAPTURE_LOG_LEVEL=verbose (default: none).

Usage:
  echo '<hook input>' | bun stop.ts

Options:
  -h, --help   Show this message
`);
}

export type StopInput = {
  session_id: string;
  transcript_path?: string;
  cwd: string;
  permission_mode?: string;
  effort?: { level?: string };
  last_assistant_message?: string;
};

if (import.meta.main) {
  if (Bun.argv.includes("-h") || Bun.argv.includes("--help")) {
    help();
    process.exit(0);
  }
  if (captureEnabled(Bun.env)) {
    let input: StopInput | undefined;
    try {
      input = JSON.parse(await Bun.stdin.text()) as StopInput;
      await main(input, Bun.env);
    } catch (error) {
      await logError(input?.cwd ?? process.cwd(), "stop", error);
    }
  }
}

export type StopResult = { captured: false } | { captured: true; ref: string; commit: string; record: TurnRecord };

export async function main(input: StopInput, env: Record<string, string | undefined>): Promise<StopResult> {
  if (!captureEnabled(env)) return { captured: false };
  const log = verboseLogger(input.cwd, "stop", env);
  log(`session ${input.session_id}, cwd ${input.cwd}`);
  const root = tryGit(input.cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) return { captured: false };
  const sessionId = input.session_id;
  const startRef = refName(sessionId, "start");
  if (!refExists(root, startRef)) {
    log(`no ${startRef}: nothing to capture`);
    return { captured: false };
  }

  const start = readRecord<StartRecord>(root, startRef);
  const turn = nextTurn(root, sessionId);
  const previousHead =
    turn === 1
      ? start.repository.headAtStart
      : readRecord<TurnRecord>(root, refName(sessionId, `turn-${turn - 1}`)).repository.headAtStop;

  const headAtStop = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  log(`turn ${turn}: previous HEAD ${previousHead ?? "(none)"}, HEAD ${headAtStop ?? "(none)"}`);
  const { commit } = await snapshot(root, headAtStop, `thunderjar capture: ${sessionId} turn-${turn}\n`);
  log(`snapshot ${commit}`);

  const agentCommits = headAtStop
    ? git(root, ["log", "--reverse", "--format=%H %s", previousHead ? `${previousHead}..HEAD` : "HEAD"])
        .split("\n")
        .filter(Boolean)
    : [];
  const leftUncommitted = (
    headAtStop
      ? git(root, ["diff", "--name-only", "--no-renames", headAtStop, commit])
      : git(root, ["ls-tree", "-r", "--name-only", commit])
  )
    .split("\n")
    .filter(Boolean);

  const isAncestor = (base: string | null) =>
    base === null || (headAtStop !== null && gitSucceeds(root, ["merge-base", "--is-ancestor", base, headAtStop]));
  const historyRewritten = !isAncestor(start.repository.headAtStart) || !isAncestor(previousHead);

  const pending = await readPending(root, sessionId);
  const prompts = pending.prompts.map((prompt) => prompt.text);
  const entries = await readTranscript(input.transcript_path);
  const harness = harnessFromEnv(env);

  const record: TurnRecord = {
    schemaVersion: 1,
    kind: "turn",
    capturedAt: new Date().toISOString(),
    turn,
    prompt: turn === 1 ? null : (prompts[0] ?? null),
    laterPrompts: turn === 1 ? prompts : prompts.slice(1),
    agent: {
      harness: "Claude Code",
      harnessVersion: harness.harnessVersion ?? versionOf(entries),
      harnessSurface: harness.harnessSurface,
      models: modelsOf(entries),
      effort: input.effort?.level ?? harness.effort,
      sessionId,
      transcriptPath: input.transcript_path ?? null,
      permissionMode: input.permission_mode ?? null,
    },
    repository: {
      branch: tryGit(root, ["branch", "--show-current"]) || null,
      headAtStop,
      agentCommits,
      leftUncommitted,
      historyRewritten,
    },
    lastAssistantMessage: input.last_assistant_message ?? null,
  };
  const ref = refName(sessionId, `turn-${turn}`);
  log(
    `${agentCommits.length} agent commits, ${leftUncommitted.length} files uncommitted, ` +
      `${prompts.length} pending prompts, historyRewritten ${historyRewritten}`,
  );
  const tag = writeRecord(root, ref, commit, record);
  log(`wrote ${ref} -> tag ${tag}`);
  await clearPending(root, sessionId);
  return { captured: true, ref, commit, record };
}
