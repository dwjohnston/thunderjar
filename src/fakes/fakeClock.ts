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

export class FakeClock implements Clock {
  #now: number;

  /** Starts at `start`: 0 by default, or epoch milliseconds for code that shows dates. */
  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  sleep(_ms: number, _options: { signal?: AbortSignal } = {}): Promise<void> {
    return new Promise(() => {});
  }

  /** Moves time on by `ms`. */
  async advance(ms: number): Promise<void> {
    this.#now += ms;
  }
}
