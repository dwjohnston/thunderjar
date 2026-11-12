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
  git,
  harnessFromEnv,
  modelsOf,
  readTranscript,
  tagExists,
  tagName,
  tryGit,
  versionOf,
  writeTag,
} from "./lib.ts";

function help() {
  console.log(`
Record the end of a one-shot task. Runs as the plugin's Stop hook, which
passes the hook input as JSON on stdin.

Does nothing unless the session's start tag exists and its end tag doesn't, so
only the first stop after /tj-oneshot is recorded. Then:
  1. Commits whatever the agent left uncommitted, including untracked files, as
     "🏁 tj-oneshot end: <session>". The commit is empty when nothing is left.
  2. Tags it with the annotated tag thunderjar/oneshot/<session>/end.
  3. Pushes the start and end tags to origin, if there is one.

It exits 1 on failure, never 2: exit code 2 would stop the agent from finishing.

Usage:
  echo '<hook input>' | bun stop.ts [--no-push]

Options:
  --no-push    Don't push the tags
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
  const argv = Bun.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    help();
    process.exit(0);
  }
  try {
    const input = JSON.parse(await Bun.stdin.text()) as StopInput;
    const result = await main(input, Bun.env, { push: !argv.includes("--no-push") });
    if (result.message) console.error(result.message);
  } catch (error) {
    console.error(`tj-oneshot: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

export async function main(input: StopInput, env: Record<string, string | undefined>, options: { push: boolean }) {
  const sessionId = input.session_id;
  const root = tryGit(input.cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) return { recorded: false };
  const startTag = tagName(sessionId, "start");
  const endTag = tagName(sessionId, "end");
  if (!tagExists(root, startTag) || tagExists(root, endTag)) return { recorded: false };

  const entries = await readTranscript(input.transcript_path);
  const harness = harnessFromEnv(env);
  const startCommit = git(root, ["rev-parse", `${startTag}^{commit}`]);
  const agentCommits = git(root, ["log", "--reverse", "--format=%H %s", `${startCommit}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const endCommit = commitEverything(root, `🏁 tj-oneshot end: ${sessionId}`);
  const leftUncommitted = git(root, ["diff", "--name-only", `${endCommit}^`, endCommit]).split("\n").filter(Boolean);

  const record = {
    schemaVersion: 1,
    kind: "end",
    capturedAt: new Date().toISOString(),
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
      root,
      branch: tryGit(root, ["branch", "--show-current"]) || null,
      startCommit,
      endCommit,
      agentCommits,
      leftUncommitted,
    },
    lastAssistantMessage: input.last_assistant_message ?? null,
  };
  writeTag(root, endTag, endCommit, `tj-oneshot end: ${sessionId}`, record);

  if (!options.push) return { recorded: true, pushed: false };
  if (tryGit(root, ["remote", "get-url", "origin"]) === null) {
    return { recorded: true, pushed: false, message: "tj-oneshot: no origin remote. Tags not pushed." };
  }
  const refs = [`refs/tags/${startTag}`, `refs/tags/${endTag}`];
  try {
    // --no-verify: the repo's pre-push hooks shouldn't stop the record being shared.
    git(root, ["push", "--no-verify", "origin", ...refs]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`recorded the one-shot, but couldn't push its tags. Push them with:\n  git push origin ${refs.join(" ")}\n${reason}`);
  }
  return { recorded: true, pushed: true };
}
