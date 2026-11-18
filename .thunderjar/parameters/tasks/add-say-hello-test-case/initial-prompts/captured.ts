/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// The start prompt of capture 49669c7c-0a9d-468d-a0aa-fbeb2bc69840, verbatim.
export default declareInitialPrompt({
  applyParameter: () =>
    writePrompt(`In this repository (thunderjar), add a Thunderjar test case under \`.thunderjar/\`. Use the \`tj-eval\` skill and follow the conventions of the existing files in \`.thunderjar/parameters/\` and \`.thunderjar/test-cases/\`.

The test case:
1. Code state (new): the public repo https://github.com/dwjohnston/blacksheepcode at tag \`tj-codestate-1\`. After checkout, its prerun runs, in order:
   1. \`bun install thunderjar@0.3.3-preview-091b441\`
   2. \`bunx thunderjar init\`
   3. \`bunx thunderjar capture install --harness claude-code\`
2. Prompt set: none.
3. Harness model: claude-code/haiku (reuse an existing parameter if one exists).
4. Initial prompt / task: "Say hello".

Constraints:
- Only write the files. Do not run the test case (no Docker here).
- Check it type-checks (\`bun run typecheck\` or the \`.thunderjar\` tsconfig, whichever applies).
- Do not commit, push, or create a PR.
- End your final output with a PR description for this change, between the lines \`---PR DESCRIPTION START---\` and \`---PR DESCRIPTION END---\`. Use the \`tj-meta-pull-request-description\` skill if available.`),
  timeoutSeconds: 1800,
});
