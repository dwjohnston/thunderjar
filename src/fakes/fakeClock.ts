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

// A Clock for tests: time stands still until the test moves it on with `advance`.

import type { Clock } from "../time/clock.ts";

/** How many turns of the event loop the code under test gets to run on after each sleep fires. */
const SETTLE_TURNS = 20;

/** Lets the code under test run on: its microtasks, and a few turns of the event loop. */
async function settle(): Promise<void> {
  for (let i = 0; i < SETTLE_TURNS; i++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * How long, in real time, `advance` waits for the code under test to reach the clock: it may still
 * be loading config or hashing files.
 */
const GRACE_MS = 5_000;

/** A sleep that hasn't fired: when it's due, and how to fire it. */
type Sleeper = { due: number; fire: () => void };

export class FakeClock implements Clock {
  #now: number;
  /** Sleeps waiting to fire, in the order they began. */
  #sleepers: Sleeper[] = [];
  /** Called when a sleep begins: `advance` may be waiting for one. */
  #onSleep: () => void = () => {};

  /** Starts at `start`: 0 by default, or epoch milliseconds for code that shows dates. */
  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  sleep(ms: number, { signal }: { signal?: AbortSignal } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const sleeper = { due: this.#now + ms, fire: resolve };
      this.#sleepers.push(sleeper);
      signal?.addEventListener(
        "abort",
        () => {
          const index = this.#sleepers.indexOf(sleeper);
          if (index === -1) return;
          this.#sleepers.splice(index, 1);
          reject(signal.reason);
        },
        { once: true },
      );
      this.#onSleep();
    });
  }

  /**
   * Moves time on by `ms`.
   *
   * First waits, in real time, until something is waiting on the clock: the code under test may
   * still be doing real I/O, e.g. loading config. Then fires each sleep due by then, in time order
   * (in the order they began, for the same time), with `now()` at its time, and lets the code under
   * test run on after each.
   *
   * Between sleeps, it only waits for microtasks and a few turns of the event loop, so the code
   * under test must keep this invariant: **between clock waits, only services do I/O**, and a fake
   * service does none.
   */
  async advance(ms: number): Promise<void> {
    await this.#somethingWaiting();
    const target = this.#now + ms;
    for (let next = this.#next(target); next !== undefined; next = this.#next(target)) {
      this.#sleepers.splice(this.#sleepers.indexOf(next), 1);
      this.#now = next.due;
      next.fire();
      await settle();
    }
    this.#now = target;
  }

  /** Resolves once a sleep is waiting on the clock, or after GRACE_MS in real time. */
  async #somethingWaiting(): Promise<void> {
    if (this.#sleepers.length > 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await new Promise<void>((resolve) => {
      this.#onSleep = resolve;
      timer = setTimeout(resolve, GRACE_MS);
    });
    clearTimeout(timer);
    this.#onSleep = () => {};
  }

  /** The first sleep due by `target`, if any. */
  #next(target: number): Sleeper | undefined {
    return this.#sleepers.reduce<Sleeper | undefined>((first, s) => (s.due <= target && (first === undefined || s.due < first.due) ? s : first), undefined);
  }
}
