/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkf5f7yremSqsRgCrm
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar-published";

// blacksheepcode at its tj-codestate-1 tag, with the published Thunderjar added, initialised, and
// its capture installed for Claude Code. Pinned by the tag's commit, not the tag, so the same text
// always builds the same thing.
//
// thunderjar is pinned to 0.3.2, what @latest resolved to when this was added. 0.3.2 has no
// `capture` command, so the last step fails, and with it the build, until it's bumped to a release
// that has it.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/blacksheepcode.git",
    commit: "0e7d397a3071f86b937a40987a50c9c546bb0543",
    thunderjar: "0.3.2",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace \\
  && bun add thunderjar@${config.thunderjar} \\
  && bunx thunderjar init \\
  && bunx thunderjar capture install --harness claude-code`,
});
