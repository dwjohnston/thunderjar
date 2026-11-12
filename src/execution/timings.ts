// How long each phase of an execution took, summed over everything that went through it: its
// builds, pushes, pulls, agents, commits and measurements. Logged when the execution ends, and
// shown by `run --timings`, so a slow run says where its time went.

/** The phases of an execution, in the order they're reported. */
export const PHASES = ["build", "pushPrerun", "pullPrerun", "agent", "collect", "commit", "pushPostrun", "measure", "cleanup"] as const;
export type Phase = (typeof PHASES)[number];

/** One phase's total: how many times it ran, how long they took together, and the longest. */
export type PhaseTiming = { count: number; totalMs: number; maxMs: number };

/** Each phase that ran at least once. `wallMs` is the whole execution, start to end. */
export type ExecutionTimings = { wallMs: number; phases: Partial<Record<Phase, PhaseTiming>> };

/** Times `job` as one run of `phase`, whether it returns or throws. */
export type Timer = <T>(phase: Phase, job: () => Promise<T>) => Promise<T>;

/** A timer, and what it has timed so far. With several jobs at once, a phase's total can exceed the wall time. */
export function timings(now: () => number = Date.now): { time: Timer; summary: () => ExecutionTimings } {
  const startedAt = now();
  const totals = new Map<Phase, PhaseTiming>();
  const time: Timer = async (phase, job) => {
    const start = now();
    try {
      return await job();
    } finally {
      const ms = now() - start;
      const before = totals.get(phase) ?? { count: 0, totalMs: 0, maxMs: 0 };
      totals.set(phase, { count: before.count + 1, totalMs: before.totalMs + ms, maxMs: Math.max(before.maxMs, ms) });
    }
  };
  const summary = (): ExecutionTimings => ({
    wallMs: now() - startedAt,
    phases: Object.fromEntries(PHASES.flatMap((phase) => (totals.has(phase) ? [[phase, totals.get(phase)]] : []))),
  });
  return { time, summary };
}

/** A timer that times nothing, for a caller that doesn't report timings. */
export const untimed: Timer = (_phase, job) => job();
