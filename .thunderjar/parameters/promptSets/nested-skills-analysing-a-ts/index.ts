/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: ac6e7cbf-e489-43be-bde9-9975f9dccb08
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declarePromptSet } from "thunderjar";

// The nested-skills fixture's skills as they are at a git tag, checked out over the code state's
// and committed. At thunderjar/promptset/nested-skills-analysing-a-ts their descriptions say "Invoke this skill
// when analysing the file a.ts." instead of "Always apply this skill.".
//
// Only src/gauntlet/nested-skills is checked out, so the agent still can't read the task's
// measurements. The code state removes origin, so the tag is fetched from the repo by URL, and it
// must be pushed there first.
export default declarePromptSet({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "thunderjar/promptset/nested-skills-analysing-a-ts",
  },
  applyParameter: (config) => `RUN git -C /workspace fetch --quiet ${config.repo} tag ${config.tag} --no-tags \\
  && git -C /workspace checkout ${config.tag} -- src/gauntlet/nested-skills \\
  && git -C /workspace tag --delete ${config.tag} > /dev/null \\
  && git -C /workspace commit --quiet -m "Thunderjar: apply promptSet"`,
});
