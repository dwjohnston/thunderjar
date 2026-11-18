/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: d9e7b968-df7b-442b-a7dd-4475b1c7b5df
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declarePromptSet } from "thunderjar-published";

// The nested-skills fixture's skills as they are at a git tag, checked out over the code state's
// and committed. At gauntlet-nested-skills-reading-files their descriptions say "Invoke this skill
// when reading files." instead of "Always apply this skill.".
//
// Only src/gauntlet/nested-skills is checked out, so the agent still can't read the task's
// measurements. The code state removes origin, so the tag is fetched from the repo by URL, and it
// must be pushed there first.
export default declarePromptSet({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "gauntlet-nested-skills-reading-files",
  },
  applyParameter: (config) => `RUN git -C /workspace fetch --quiet ${config.repo} tag ${config.tag} --no-tags \\
  && git -C /workspace checkout ${config.tag} -- src/gauntlet/nested-skills \\
  && git -C /workspace tag --delete ${config.tag} > /dev/null \\
  && git -C /workspace commit --quiet -m "Thunderjar: apply promptSet"`,
});
