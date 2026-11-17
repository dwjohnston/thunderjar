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

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// Replays an earlier session's prompt, verbatim.
const prompt = [
  "Goal: add a Thunderjar test case. Read `.thunderjar/AGENTS.md`, `skills/` (especially the tj-eval skill) and existing parameters under `.thunderjar/parameters/` and `.thunderjar/test-cases/` to follow conventions.",
  "",
  "The test case:",
  "1. Code state (new): `https://github.com/dwjohnston/blacksheepcode` at tag `tj-codestate-1` (resolves to 0e7d397a3071f86b937a40987a50c9c546bb0543). Prerun steps, in order:",
  "   a. `bun add thunderjar@0.3.2` (this is what `thunderjar@latest` resolves to today; pin it, don't use @latest)",
  "   b. `bunx thunderjar init`",
  "   c. `bunx thunderjar capture install --harness claude-code`",
  "   Note: 0.3.2 may not ship the `capture` command, so step c may fail. Keep it as specified; do not work around it. Report what you find.",
  "2. Prompt set: the existing `none`.",
  "3. Harness model: claude-code with the Haiku model. Reuse the existing claude-code harness version; add a new harnessModel parameter if one doesn't exist.",
  "4. Task (new): initial prompt is exactly `Say hello`. Keep measurements minimal.",
  "",
  "Verify what you can locally: `bun run typecheck`, `bun run lint`, `bun test`, and any thunderjar validation/list command (e.g. `bun tj ...`). Try a real run only if cheap and possible; if not, say so.",
].join("\n");

export default declareInitialPrompt({
  applyParameter: () => writePrompt(prompt),
  timeoutSeconds: 1800,
});
