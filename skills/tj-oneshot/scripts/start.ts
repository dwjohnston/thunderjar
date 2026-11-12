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
  findOneshotPrompt,
  findTranscript,
  git,
  lastField,
  modelsOf,
  readTranscript,
  tagExists,
  tagName,
  tryGit,
  writeTag,
  type TranscriptEntry,
} from "./lib.ts";

// The transcript is written asynchronously, so the prompt may take a moment to appear.
const TRANSCRIPT_WAIT_MS = 10_000;
const TRANSCRIPT_POLL_MS = 500;

function help() {
  console.log(`
Record the start of a one-shot task.

Commits everything in the working tree, including untracked files, as
"🎯 tj-oneshot start: <session>". The commit is empty when the tree is clean.
Then tags it with the annotated tag thunderjar/oneshot/<session>/start, whose
message holds the prompt, verbatim from the session transcript, and the agent
and repository details as JSON.

Usage:
  bun start.ts --session <id> [--effort <level>]

Options:
  --session <id>     The Claude Code session ID
  --effort <level>   The effort level, e.g. high. Recorded as null when left out
  -h, --help         Show this message
`);
}

export type StartOptions = {
  cwd: string;
  sessionId: string;
  effort: string | null;
  transcriptPath: string;
  waitMs?: number;
};

if (import.meta.main) {
  const args = parseArgs(Bun.argv.slice(2));
  if (args.help) {
    help();
    process.exit(0);
  }
  const sessionId = args.session ?? Bun.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId) {
    console.error("Missing --session.");
    help();
    process.exit(1);
  }
  const transcriptPath = findTranscript(sessionId);
  if (!transcriptPath) {
    console.error(`Could not find the transcript for session ${sessionId}.`);
    process.exit(1);
  }
  try {
    const { tag, commit } = await main({
      cwd: process.cwd(),
      sessionId,
      effort: args.effort || null,
      transcriptPath,
    });
    console.log(`Recorded the start as ${tag} (commit ${commit.slice(0, 7)}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export async function main(options: StartOptions) {
  const { cwd, sessionId, effort, transcriptPath } = options;
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const tag = tagName(sessionId, "start");
  if (tagExists(root, tag)) {
    throw new Error(`The start of session ${sessionId} is already recorded as ${tag}.`);
  }

  const { entries, prompt } = await waitForPrompt(transcriptPath, options.waitMs ?? TRANSCRIPT_WAIT_MS);
  if (prompt === null) {
    throw new Error(`Could not find the /tj-oneshot prompt in the transcript ${transcriptPath}.`);
  }

  const headBeforeStart = tryGit(root, ["rev-parse", "HEAD"]);
  const branch = tryGit(root, ["branch", "--show-current"]) || null;
  const commit = commitEverything(root, `🎯 tj-oneshot start: ${sessionId}`);

  const record = {
    schemaVersion: 1,
    kind: "start",
    capturedAt: new Date().toISOString(),
    prompt: { text: prompt, verbatim: true },
    agent: {
      harness: "Claude Code",
      harnessVersion: lastField(entries, "version"),
      harnessSurface: lastField(entries, "entrypoint"),
      model: modelsOf(entries).at(-1) ?? null,
      effort,
      sessionId,
      transcriptPath,
      permissionMode: lastField(entries, "permissionMode"),
    },
    repository: { root, branch, headBeforeStart, startCommit: commit },
  };
  writeTag(root, tag, commit, `tj-oneshot start: ${sessionId}`, record);
  return { tag, commit, record };
}

async function waitForPrompt(path: string, waitMs: number) {
  const deadline = Date.now() + waitMs;
  let entries: TranscriptEntry[] = [];
  while (true) {
    entries = await readTranscript(path);
    const prompt = findOneshotPrompt(entries);
    if (prompt !== null || Date.now() >= deadline) return { entries, prompt };
    await Bun.sleep(TRANSCRIPT_POLL_MS);
  }
}

function parseArgs(argv: string[]) {
  const args: { session?: string; effort?: string; help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--session") args.session = argv[++i];
    else if (arg === "--effort") args.effort = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      help();
      process.exit(1);
    }
  }
  return args;
}
