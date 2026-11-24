/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Time, as a service. Code that reads the time, or waits, takes a Clock, so a test can give it a
// FakeClock (src/fakes/fakeClock.ts) and move time on itself. `systemClock` is the real one, and
// the only place in src/ that reads the system's time.

export interface Clock {
  /** Milliseconds since the epoch, or, for a FakeClock, since its start. */
  now(): number;
  /**
   * Resolves after `ms`. `Infinity` never resolves. Aborting `signal` rejects it with the signal's
   * reason, and it never resolves.
   */
  sleep(ms: number, options?: { signal?: AbortSignal }): Promise<void>;
}

/** The system's clock: `Date.now` and timers. */
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, { signal } = {}) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      // setTimeout would fire at once for Infinity.
      const timer = Number.isFinite(ms) ? setTimeout(resolve, ms) : undefined;
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    }),
};

/** Calls `tick` every `ms` on `clock`, until the function it returns is called. In place of setInterval. */
export function every(clock: Clock, ms: number, tick: () => void): () => void {
  const controller = new AbortController();
  const loop = async () => {
    while (!controller.signal.aborted) {
      try {
        await clock.sleep(ms, { signal: controller.signal });
      } catch {
        return;
      }
      tick();
    }
  };
  void loop();
  return () => controller.abort();
}
