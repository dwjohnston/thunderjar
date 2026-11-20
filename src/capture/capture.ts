/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// What the hooks do: on a prompt, snapshot the working tree as the session's `start` record, or keep the
// prompt for the turn; at the end of a turn, snapshot it as `turn-<n>`. The records go into one of two
// stores (store.ts): by default, under refs/thunderjar/capture/<session>/, each a commit on no branch
// under an annotated tag whose message is the record as JSON; or, with THUNDERJAR_CAPTURE_STORE=branch,
// as commits on refs/heads/thunderjar/capture/<session>. The branch, the index and the working tree are
// left as they are.
import { ADAPTERS, type CaptureEvent, type HarnessId } from "./adapters.ts";
import { addPending, clearPending, type Env, logError, modelsOf, readPending, readTranscript, verboseLogger, versionOf } from "./files.ts";
import { git, gitSucceeds, repoRoot, snapshotTree, treeOf, tryGit } from "./git.ts";
import type { StartRecord, TurnRecord } from "./records.ts";
import { configuredStore, nextTurnIn, readRecordIn, startedIn, writeRecordIn } from "./store.ts";

/** Capture is on wherever its hooks are installed, unless `THUNDERJAR_CAPTURE` is `0` or `false`. */
export function captureEnabled(env: Env): boolean {
  const value = env.THUNDERJAR_CAPTURE?.trim().toLowerCase();
  return value !== "0" && value !== "false";
}

export type PromptResult =
  | { captured: "nothing" }
  | { captured: "start"; ref: string; commit: string; record: StartRecord }
  | { captured: "pending" };

/**
 * On the session's first prompt, snapshots the working tree as its start. On a later one, leaves the
 * prompt in `<git-dir>/thunderjar/<session>/pending.json` for `captureStop`.
 */
export async function capturePrompt(event: CaptureEvent, env: Env): Promise<PromptResult> {
  if (!captureEnabled(env)) return { captured: "nothing" };
  const log = verboseLogger(event.cwd, "prompt", env);
  await log(`${event.harness} session ${event.sessionId}, cwd ${event.cwd}`);
  const root = repoRoot(event.cwd);
  if (!root) return { captured: "nothing" };

  const { sessionId } = event;
  const prompt = event.prompt ?? "";
  const store = configuredStore(env);
  const existing = startedIn(root, sessionId);
  if (existing) {
    await addPending(root, sessionId, prompt);
    await log(`start exists in the ${existing} store: prompt (${prompt.length} chars) added to pending`);
    return { captured: "pending" };
  }

  const entries = await readTranscript(event.transcriptPath);
  const headAtStart = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const branch = tryGit(root, ["branch", "--show-current"]) || null;
  await log(`first prompt: branch ${branch ?? "(detached)"}, HEAD ${headAtStart ?? "(none)"}, ${entries.length} transcript entries`);
  const tree = await snapshotTree(root);
  const dirty = tree !== treeOf(root, headAtStart);
  await log(`snapshot tree ${tree}${dirty ? " (dirty)" : ""}`);

  const record: StartRecord = {
    schemaVersion: 1,
    kind: "start",
    capturedAt: new Date().toISOString(),
    prompt,
    agent: {
      harness: event.harness,
      harnessVersion: event.harnessVersion ?? ADAPTERS[event.harness].version(env) ?? versionOf(entries),
      harnessSurface: event.harnessSurface ?? null,
      effort: event.effort ?? null,
      sessionId,
      transcriptPath: event.transcriptPath ?? null,
      permissionMode: event.permissionMode ?? null,
    },
    repository: { root, branch, headAtStart, dirty },
  };
  const { ref, commit } = writeRecordIn(root, store, sessionId, "start", tree, headAtStart, record);
  await log(`wrote ${ref} -> ${commit}`);
  return { captured: "start", ref, commit, record };
}

export type StopResult = { captured: false } | { captured: true; ref: string; commit: string; record: TurnRecord };

/** Snapshots the working tree at the end of a turn, as the session's next `turn-<n>`. */
export async function captureStop(event: CaptureEvent, env: Env): Promise<StopResult> {
  if (!captureEnabled(env)) return { captured: false };
  const log = verboseLogger(event.cwd, "stop", env);
  await log(`${event.harness} session ${event.sessionId}, cwd ${event.cwd}`);
  const root = repoRoot(event.cwd);
  if (!root) return { captured: false };
  const { sessionId } = event;
  // A session stays in the store its start is in; an invalid THUNDERJAR_CAPTURE_STORE still fails here.
  configuredStore(env);
  const store = startedIn(root, sessionId);
  if (!store) {
    await log(`no start for session ${sessionId}: nothing to capture`);
    return { captured: false };
  }

  const start = readRecordIn<StartRecord>(root, store, sessionId, "start");
  const turn = nextTurnIn(root, store, sessionId);
  const previousHead =
    turn === 1 ? start.repository.headAtStart : readRecordIn<TurnRecord>(root, store, sessionId, `turn-${turn - 1}`).repository.headAtStop;

  const headAtStop = tryGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  await log(`turn ${turn}: previous HEAD ${previousHead ?? "(none)"}, HEAD ${headAtStop ?? "(none)"}`);
  const tree = await snapshotTree(root);
  await log(`snapshot tree ${tree}`);

  const lines = (output: string) => output.split("\n").filter(Boolean);
  const agentCommits = headAtStop ? lines(git(root, ["log", "--reverse", "--format=%H %s", previousHead ? `${previousHead}..HEAD` : "HEAD"])) : [];
  const leftUncommitted = lines(
    headAtStop ? git(root, ["diff", "--name-only", "--no-renames", headAtStop, tree]) : git(root, ["ls-tree", "-r", "--name-only", tree]),
  );
  const isAncestor = (base: string | null) => base === null || (headAtStop !== null && gitSucceeds(root, ["merge-base", "--is-ancestor", base, headAtStop]));
  const historyRewritten = !isAncestor(start.repository.headAtStart) || !isAncestor(previousHead);

  const prompts = (await readPending(root, sessionId)).prompts.map((prompt) => prompt.text);
  const entries = event.harness === "claude-code" ? await readTranscript(event.transcriptPath) : [];
  const model = event.model ?? null;

  const record: TurnRecord = {
    schemaVersion: 1,
    kind: "turn",
    capturedAt: new Date().toISOString(),
    turn,
    prompt: turn === 1 ? null : (prompts[0] ?? null),
    laterPrompts: turn === 1 ? prompts : prompts.slice(1),
    agent: {
      harness: event.harness,
      harnessVersion: event.harnessVersion ?? start.agent.harnessVersion ?? versionOf(entries),
      harnessSurface: event.harnessSurface ?? null,
      model,
      models: event.harness === "claude-code" ? modelsOf(entries) : model ? [model] : [],
      turnId: event.turnId ?? null,
      effort: event.effort ?? null,
      sessionId,
      transcriptPath: event.transcriptPath ?? start.agent.transcriptPath,
      permissionMode: event.permissionMode ?? null,
    },
    repository: { branch: tryGit(root, ["branch", "--show-current"]) || null, headAtStop, agentCommits, leftUncommitted, historyRewritten },
    lastAssistantMessage: event.lastAssistantMessage ?? null,
  };
  await log(`${agentCommits.length} agent commits, ${leftUncommitted.length} files uncommitted, ${prompts.length} pending prompts, historyRewritten ${historyRewritten}`);
  const { ref, commit } = writeRecordIn(root, store, sessionId, `turn-${turn}`, tree, headAtStop, record);
  await log(`wrote ${ref} -> ${commit}${store === "branch" ? ` (turn-${turn})` : ""}`);
  await clearPending(root, sessionId);
  return { captured: true, ref, commit, record };
}

/**
 * A hook's whole run: `input` is the JSON the harness passed on stdin. Never throws and never prints,
 * so it can't fail or change the agent's session: errors go to `.thunderjar/logs/capture.log`.
 */
export async function runHook(hook: "prompt" | "stop", harness: HarnessId, input: string, env: Env): Promise<void> {
  if (!captureEnabled(env)) return;
  const adapter = ADAPTERS[harness];
  if (!adapter.runningUnder(env)) return;
  let cwd = process.cwd();
  try {
    const event = adapter.toEvent(JSON.parse(input) as Record<string, unknown>, env);
    cwd = event.cwd;
    await (hook === "prompt" ? capturePrompt(event, env) : captureStop(event, env));
  } catch (error) {
    await logError(cwd, hook, error);
  }
}
