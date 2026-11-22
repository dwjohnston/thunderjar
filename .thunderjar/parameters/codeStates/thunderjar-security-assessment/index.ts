/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: 984d4e8d-dedf-41bb-a0a5-0471af869440
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { codeStateGitCheckout, declareCodeState, resolveGitCheckout } from "thunderjar";

// This repository at tag tj-thunderjar-security-assessment: main as it was when the
// security-assessment task was written, with dependencies installed, so the agent has no need of the
// network. At that commit, API keys passed with `docker run -e` are kept by `docker commit` in the
// postrun image: the issue the task's measurement looks for.
//
// Sealed: no origin, and the tag is on a commit from before the task and its measurement were added.
// Keep it there, or the agent can read what's being measured. codeStateGitCheckout looks up the tag's
// commit, so the Dockerfile pins a SHA; this adds the install on top.
const checkout = codeStateGitCheckout({
  repo: "https://github.com/dwjohnston/thunderjar.git",
  tag: "tj-thunderjar-security-assessment",
});

export default declareCodeState({
  config: checkout.config!,
  resolve: resolveGitCheckout,
  applyParameter: (config, ctx) => `${checkout.applyParameter!(config, ctx)}
RUN bun install --frozen-lockfile`,
});
