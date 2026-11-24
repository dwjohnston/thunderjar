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

// New IDs, as a service. Code that makes an ID takes Ids, so a test can give it one that makes
// the same IDs every time. `systemIds` is the real one.
import type { Clock } from "../time/clock.ts";
import { ulid } from "./ulid.ts";

export interface Ids {
  /** A new execution's ID: a ULID, so IDs sort by when they were made. */
  executionId(): string;
}

/** ULIDs for the time on `clock`, with random bits from ulid.ts. */
export const systemIds = (clock: Clock): Ids => ({ executionId: () => ulid(clock.now()) });
