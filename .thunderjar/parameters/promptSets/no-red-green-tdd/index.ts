/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declarePromptSet } from "thunderjar";

// The code state's prompts, minus the red-green-tdd skill, from both .claude/skills and .agents/skills.
export default declarePromptSet({
  applyParameter: () => `RUN cd /workspace \\
  && git rm -r --quiet --ignore-unmatch .claude/skills/red-green-tdd .agents/skills/red-green-tdd \\
  && git commit --quiet -m "Thunderjar: apply promptSet"`,
});
