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

// Ids for tests: the same IDs every time, counting up, so a test can name them.

import type { Ids } from "../execution/ids.ts";

export class FakeIds implements Ids {
  #executions = 0;

  /** `00000000000000000000000001`, then `…02`, and so on: 26 characters, like a ULID. */
  executionId(): string {
    return String(++this.#executions).padStart(26, "0");
  }
}
