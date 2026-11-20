import { declareInitialPrompt, writePrompt } from "thunderjar-published";

// Word for word, from captured session 49669c7c-0a9d-468d-a0aa-fbeb2bc69840.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("In this repository (thunderjar), add a Thunderjar test case under `.thunderjar/`. Use the `tj-eval` skill and follow the conventions of the existing files in `.thunderjar/parameters/` and `.thunderjar/test-cases/`.\n\nThe test case:\n1. Code state (new): the public repo https://github.com/dwjohnston/blacksheepcode at tag `tj-codestate-1`. After checkout, its prerun runs, in order:\n   1. `bun install thunderjar@0.3.3-preview-091b441`\n   2. `bunx thunderjar init`\n   3. `bunx thunderjar capture install --harness claude-code`\n2. Prompt set: none.\n3. Harness model: claude-code/haiku (reuse an existing parameter if one exists).\n4. Initial prompt / task: \"Say hello\".\n\nConstraints:\n- Only write the files. Do not run the test case (no Docker here).\n- Check it type-checks (`bun run typecheck` or the `.thunderjar` tsconfig, whichever applies).\n- Do not commit, push, or create a PR.\n- End your final output with a PR description for this change, between the lines `---PR DESCRIPTION START---` and `---PR DESCRIPTION END---`. Use the `tj-meta-pull-request-description` skill if available."),
  timeoutSeconds: 900,
});
