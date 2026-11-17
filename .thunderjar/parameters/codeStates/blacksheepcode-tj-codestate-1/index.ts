/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLmFeH4wWyUQWpa9vfL
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareCodeState } from "thunderjar-published";

// blacksheepcode at the tj-codestate-1 tag (commit 0e7d397a3071f86b937a40987a50c9c546bb0543), with
// a Thunderjar preview installed, initialised, and its Claude Code capture installed.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/blacksheepcode.git",
    tag: "tj-codestate-1",
    thunderjarVersion: "0.3.3-preview-091b441",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.tag} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace \\
  && bun install thunderjar@${config.thunderjarVersion} \\
  && bunx thunderjar init \\
  && bunx thunderjar capture install --harness claude-code`,
});
