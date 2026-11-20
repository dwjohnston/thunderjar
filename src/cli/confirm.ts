/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 *
 * Humans: add your notes here
 */

// Asking the user before doing something that can't be undone, e.g. `purge`.
import { textOutput } from "./textOutput.ts";

export /** Asks `question` on the terminal, and whether the answer was yes. */
async function confirm(question: string): Promise<boolean> {
  textOutput().write(`${question} [y/N] `);
  const reader = Bun.stdin.stream().getReader();
  let answer = "";
  try {
    while (!answer.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += new TextDecoder().decode(value);
    }
  } finally {
    reader.releaseLock();
  }
  return /^y(es)?$/i.test(answer.trim());
}
