/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 *
 * Humans: add your notes here
 */

// `--older-than <age>`, which `purge image` and `purge capture` both take.
import { InvalidArgumentError, Option } from "commander";
import { parseAge } from "../../../execution/purge.ts";

/** `--older-than <age>`, in ms, picking `what` by when they started. */
export const olderThanOption = (what: string) =>
  new Option("--older-than <age>", `only ${what} that started longer ago than <age>, e.g. 30d, 12h, 90m or 2w`).argParser((value: string) => {
    try {
      return parseAge(value);
    } catch (error) {
      throw new InvalidArgumentError((error as Error).message);
    }
  });
