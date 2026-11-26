/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhzk1BgPsDT4k7aD6J
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";

// How the agent got around: shell commands, and dedicated read and search tools, by kind, so the
// four harnesses compare. Codex makes only shell calls.
export default declareMeasurement({
  instrument: "toolCalled",
  config: { tools: ["shell", "read", "search"] },
  metrics: {
    shellCalls: { score: (v) => v.shell, stat: "mean" },
    readCalls: { score: (v) => v.read, stat: "mean" },
    searchCalls: { score: (v) => v.search, stat: "mean" },
  },
});
