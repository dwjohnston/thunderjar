/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: be61f223-aa63-4d40-ae62-416f589479dc
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";

// Which of the fixture's skills did the agent invoke? Each metric is beside the emoji one that says
// whether it followed that skill: base (src/gauntlet/nested-skills/.agents/skills) beside red.ts,
// a (a/.agents/skills) beside green.ts, b (b/.agents/skills), which a.ts has nothing to do with, beside blue.ts.
export default declareMeasurement({
  instrument: "skillInvoked",
  config: { skills: ["base", "a", "b"] },
  metrics: {
    invokedBase: { score: (v) => v.base, stat: "rate" },
    invokedA: { score: (v) => v.a, stat: "rate" },
    invokedB: { score: (v) => v.b, stat: "rate" },
  },
});
