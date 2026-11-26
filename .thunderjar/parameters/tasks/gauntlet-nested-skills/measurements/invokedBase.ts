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

// Did the agent invoke the base skill, in src/gauntlet/nested-skills/.agents/skills? Whether it did, beside red.ts, which says whether it followed it.
export default declareMeasurement({
  instrument: "skillInvoked",
  config: { skill: "base" },
  metrics: { invokedBase: { stat: "rate" } },
});
