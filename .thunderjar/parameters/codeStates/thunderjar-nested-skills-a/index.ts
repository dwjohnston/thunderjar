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

import { declareCodeState } from "thunderjar-published";

// This repository at the commit that added src/gauntlet/nested-skills, with the agent starting in
// the fixture'\''s a/ folder, inside both the base skill'\''s folder and skill a'\''s.
//
// The commit is the one before the gauntlet-nested-skills task and test case were added, so the
// agent can't read their measurements. Fetched by its SHA, so the build still finds it once its
// branch is squash-merged and deleted.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "ee5221cd7b95f517c28dbf049f6ab49edace969b",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin
WORKDIR /workspace/src/gauntlet/nested-skills/a`,
});
