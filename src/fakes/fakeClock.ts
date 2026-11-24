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

/** A sleep that hasn't fired: when it's due, and how to fire it. */
type Sleeper = { due: number; fire: () => void };

export class FakeClock implements Clock {
  #now: number;
  /** Sleeps waiting to fire, in the order they began. */
  #sleepers: Sleeper[] = [];

  /** Starts at `start`: 0 by default, or epoch milliseconds for code that shows dates. */
  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  sleep(ms: number, _options: { signal?: AbortSignal } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.#sleepers.push({ due: this.#now + ms, fire: resolve });
    });
  }

  /**
   * Moves time on by `ms`. Fires each sleep due by then, in time order (in the order they began,
   * for the same time), with `now()` at its time, and lets the code under test run on after each.
   */
  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    for (let next = this.#next(target); next !== undefined; next = this.#next(target)) {
      this.#sleepers.splice(this.#sleepers.indexOf(next), 1);
      this.#now = next.due;
      next.fire();
      await settle();
    }
    this.#now = target;
  }

  /** The first sleep due by `target`, if any. */
  #next(target: number): Sleeper | undefined {
    return this.#sleepers.reduce<Sleeper | undefined>((first, s) => (s.due <= target && (first === undefined || s.due < first.due) ? s : first), undefined);
  }
}
