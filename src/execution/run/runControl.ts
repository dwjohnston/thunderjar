/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// How level 1 asks the levels below to stop, on Ctrl-C or SIGTERM, and how long they wait for
// what is under way. Asked once, nothing new starts and what is going is given a short while to
// end. Asked again, or once that while is up, nobody waits any longer: the command must get to
// the runtime's `afterExecution` and return before whoever sent the signal kills it outright.
import type { Clock } from "../../services/Clock/Clock.ts";

/** What the levels below `runCommand` are given, to know when to stop. */
export type RunControl = {
  /** Once true, nothing new starts: no build, no run, no upload. */
  shouldStop(): boolean;
  /** Resolves when asked to stop. Never rejects. */
  stopped: Promise<void>;
  /** Resolves when asked again: stop waiting for what is still going. Never rejects. */
  forced: Promise<void>;
};

/** A RunControl, and how its owner tells it. */
export type RunControls = RunControl & {
  /** Asks everything to stop. Again does nothing. */
  stop(): void;
  /** Stops, and stops waiting too. */
  force(): void;
};

/** A control nobody has asked to stop yet. */
export function createRunControl(): RunControls {
  const stopped = Promise.withResolvers<void>();
  const forced = Promise.withResolvers<void>();
  let stopping = false;
  const stop = () => {
    stopping = true;
    stopped.resolve();
  };
  return {
    shouldStop: () => stopping,
    stopped: stopped.promise,
    forced: forced.promise,
    stop,
    force: () => {
      stop();
      forced.resolve();
    },
  };
}

/** How long, once asked to stop, what is under way has to end by itself: a build, a push, a container being removed. */
export const STOP_SETTLE_MS = 15_000;

/** What `settled` gives for work it stopped waiting for. */
export const ABANDONED = "abandoned";

/**
 * Waits for `work`, and gives its value. Once `control` is asked to stop, it waits only
 * STOP_SETTLE_MS more, and not at all once forced: then it gives ABANDONED, and `work` goes on
 * with nobody waiting, whatever it later throws ignored. Throws what `work` throws meanwhile.
 */
export async function settled<T>(work: Promise<T>, control: RunControl, clock: Pick<Clock, "setTimeout" | "clearTimeout">): Promise<{ value: T } | typeof ABANDONED> {
  let over = false;
  let timer: ReturnType<Clock["setTimeout"]> | undefined;
  const gaveUp = new Promise<typeof ABANDONED>((resolve) => {
    void control.stopped.then(() => {
      if (!over) timer = clock.setTimeout(() => resolve(ABANDONED), STOP_SETTLE_MS);
    });
    void control.forced.then(() => resolve(ABANDONED));
  });
  // Once given up on, its failure is nobody's.
  work.catch(() => {});
  try {
    return await Promise.race([work.then((value) => ({ value })), gaveUp]);
  } finally {
    over = true;
    clock.clearTimeout(timer);
  }
}
