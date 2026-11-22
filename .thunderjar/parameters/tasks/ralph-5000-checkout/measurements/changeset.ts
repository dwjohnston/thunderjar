/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareMeasurement } from "thunderjar";

// The changesets added since the start, and whether any uses minor or major. AGENTS.md says a
// new feature is patch while in 0.x; the task files say minor.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "git diff --name-only --diff-filter=A thunderjar-start HEAD -- .changeset/ | grep -v README | xargs -r cat" },
  metrics: {
    added: { score: (v) => /\"thunderjar\":/.test(v.stdout), stat: "rate", better: "higher" },
    notPatch: { score: (v) => /\"thunderjar\":\s*(minor|major)/.test(v.stdout), stat: "rate", better: "lower" },
  },
});
