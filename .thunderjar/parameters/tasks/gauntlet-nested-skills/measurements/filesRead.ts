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

// Did the agent read a.ts, which it was asked about, and a's SKILL.md? Beside skillsInvoked.ts:
// Codex reads a skill's SKILL.md instead of invoking it, so this one compares across harnesses.
export default declareMeasurement({
  instrument: "fileRead",
  config: { paths: ["a/a.ts", "a/.agents/skills/a/SKILL.md"] },
  metrics: {
    readATs: { score: (v) => v["a/a.ts"], stat: "rate", better: "higher" },
    readSkillA: { score: (v) => v["a/.agents/skills/a/SKILL.md"], stat: "rate" },
  },
});
