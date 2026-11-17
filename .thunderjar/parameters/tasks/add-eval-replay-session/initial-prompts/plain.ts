/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiMoXaxn9oYmSnwtm3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// Replays an earlier session's prompt, verbatim. It nests the prompt of the session before it,
// the one replayed by add-test-case-blacksheepcode.
const prompt = [
  "You are in the thunderjar repo (cwd).",
  "",
  "## Goal",
  "",
  "Add a Thunderjar eval that replays an earlier agent session in this repo. Read `.thunderjar/AGENTS.md`, the tj-eval skill, and the existing `.thunderjar/parameters/` and `.thunderjar/test-cases/` to follow conventions. In particular, see `resolve` in `src/api/declarations.ts`.",
  "",
  "## The eval",
  "",
  "- **Code state:** this repo at tag `tj-codestate-thunderjar-1`, with dependencies installed. Reference the tag in `config`; use `resolve` if you need its commit. Model it on `thunderjar-main`.",
  "- **Prompt set:** `none`.",
  "- **Harness model:** `claude-code-2.1.311/claude-opus-5-5`.",
  "- **Base image:** `node20`, 1 iteration.",
  "- **Task:** new. Its initial prompt is the text between the markers below, verbatim.",
  "",
  "----- BEGIN INITIAL PROMPT -----",
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
  "----- END INITIAL PROMPT -----",
  "",
  "## Measurements",
  "",
  "Measure the agent's end state against the starting commit, since the agent picks its own file names. Any measurement format is fine.",
  "",
  "1. **Created the right files**, each new:",
  "   - a code state, `.thunderjar/parameters/codeStates/<name>/index.ts`",
  "   - a task with at least one `initial-prompts/*.ts`",
  "   - at least one `measurements/*.ts` in that task",
  "   - a test case, `.thunderjar/test-cases/<name>.ts`",
  "2. **Tag, not commit:** the new code state names `tj-codestate-1` and does not hard-code `0e7d397a3071f86b937a40987a50c9c546bb0543`.",
  "3. **Created a measurement:** at least one new file under `.thunderjar/parameters/tasks/*/measurements/`. Its format doesn't matter.",
  "",
  "## Finish",
  "",
  "Run `bun tj generate`, `bun tj plan <test-case>`, `bun run typecheck`, `bun run lint` and `bun test`, and report what you verified and what you didn't.",
].join("\n");

export default declareInitialPrompt({
  applyParameter: () => writePrompt(prompt),
  timeoutSeconds: 2700,
});
