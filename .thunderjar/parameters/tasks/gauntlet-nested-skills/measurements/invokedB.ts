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

// Did the agent invoke skill b, in src/gauntlet/nested-skills/b/.agents/skills, which a.ts has nothing to do with? Whether it did, beside blue.ts, which says whether it followed it.
export default declareMeasurement({
  instrument: "skillInvoked",
  config: { skill: "b" },
  metrics: { invokedB: { stat: "rate" } },
});
