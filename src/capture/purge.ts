/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 *
 * Humans: add your notes here
 */

// Deleting captured sessions, in both stores, here or on a remote: what `purge capture` does. Only
// refs are deleted, never objects, so a tag a test case put on a snapshot commit keeps it, and git's
// own gc decides when the rest goes.
import { BRANCH_PREFIX } from "./branch.ts";
import { git, gitSucceeds, REF_PREFIX } from "./git.ts";
import { type Capture, type CaptureRef, capturesOf, parseCaptureRef, type Verdict } from "./list.ts";

export const PURGE_FROM = ["local", "remote", "all"] as const;
export type PurgeFrom = (typeof PURGE_FROM)[number];

export type CaptureSelection = { sessions: string[]; all: boolean; olderThanMs?: number; verdict?: Verdict };

/** A session to purge: what its records say, where they're readable, and its refs in each place. */
export type PurgeTarget = { session: string; verdict: Verdict | null; startedAt: string | null; prompt: string | null; local: string[]; remote: string[] };

export class UnknownSessionError extends Error {
  constructor(readonly sessions: string[]) {
    super(`No capture of ${sessions.length === 1 ? "session" : "sessions"} ${sessions.join(", ")}. \`thunderjar capture list\` shows the captures.`);
  }
}

/** Why `selection` can't be purged, or undefined if it can. A bare `purge capture` never purges everything. */
export function selectionProblem({ sessions, all, olderThanMs, verdict }: CaptureSelection): string | undefined {
  if (sessions.length > 0 && all) return "Give session IDs or --all: only one of them.";
  if (sessions.length === 0 && !all && olderThanMs === undefined && verdict === undefined) {
    return "Say which captures to purge: session IDs, --older-than <age>, --verdict <verdict>, or --all.";
  }
  return undefined;
}

/** The capture refs on `remote`, in both stores, without fetching them. */
export function remoteCaptureRefs(root: string, remote: string): CaptureRef[] {
  return git(root, ["ls-remote", remote, `${REF_PREFIX}/*`, `${BRANCH_PREFIX}/*`])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [oid, ref] = line.split("\t");
      return { ref: ref!, oid: oid! };
    })
    .filter(({ ref }) => !ref.endsWith("^{}") && parseCaptureRef(ref) !== undefined);
}

/** Fetches the objects `refs` point at from `remote`, so their records can be read. Creates no refs. */
export function fetchObjects(root: string, remote: string, refs: CaptureRef[]): void {
  if (refs.length === 0) return;
  git(root, ["fetch", "--quiet", "--no-write-fetch-head", "--stdin", remote], { stdin: `${refs.map(({ ref }) => ref).join("\n")}\n` });
}

/** The refs whose objects this repository has. */
export const readable = (root: string, refs: CaptureRef[]) => refs.filter(({ oid }) => gitSucceeds(root, ["cat-file", "-e", oid]));

/**
 * The sessions `selection` picks from the local and remote refs, oldest first. Records are read from
 * `readableRefs`; a session without one has no verdict or start, so a filter on them leaves it out.
 * Throws `UnknownSessionError` for a named session in neither.
 */
export function selectTargets(root: string, refs: { local: CaptureRef[]; remote: CaptureRef[] }, readableRefs: CaptureRef[], selection: CaptureSelection, now = Date.now()): PurgeTarget[] {
  const captures = new Map<string, Capture>(capturesOf(root, readableRefs).map((capture) => [capture.session, capture]));
  const targets = new Map<string, PurgeTarget>();
  for (const place of ["local", "remote"] as const) {
    for (const { ref } of refs[place]) {
      const session = parseCaptureRef(ref)?.session;
      if (session === undefined) continue;
      const capture = captures.get(session);
      const target = targets.get(session) ?? {
        session,
        verdict: capture?.verdict ?? null,
        startedAt: capture?.startedAt ?? null,
        prompt: capture?.prompt ?? null,
        local: [],
        remote: [],
      };
      target[place].push(ref);
      targets.set(session, target);
    }
  }
  const missing = selection.sessions.filter((session) => !targets.has(session));
  if (missing.length > 0) throw new UnknownSessionError(missing);

  const { sessions, verdict, olderThanMs } = selection;
  return [...targets.values()]
    .filter((target) => sessions.length === 0 || sessions.includes(target.session))
    .filter((target) => verdict === undefined || target.verdict === verdict)
    .filter((target) => olderThanMs === undefined || (target.startedAt !== null && now - Date.parse(target.startedAt) > olderThanMs))
    .sort((a, b) => (a.startedAt ?? "~").localeCompare(b.startedAt ?? "~") || a.session.localeCompare(b.session));
}

/** Deletes `refs` from this repository, in one transaction. */
export function deleteLocal(root: string, refs: string[]): void {
  if (refs.length === 0) return;
  git(root, ["update-ref", "--stdin"], { stdin: refs.map((ref) => `delete ${ref}\n`).join("") });
}

/** Deletes `refs` on `remote`. --no-verify: the repository's pre-push hooks are about branches, not records. */
export function deleteRemote(root: string, remote: string, refs: string[]): void {
  for (let i = 0; i < refs.length; i += 200) git(root, ["push", "--quiet", "--no-verify", remote, "--delete", ...refs.slice(i, i + 200)]);
}
