/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareInitialPrompt, writePrompt } from "thunderjar";

// The ralph loop's prompt from capture 878b577e-ad2d-4b67-aa98-33c6adede43f, word for word.
const prompt = "You are one iteration of a ralph loop. Do the task below, on your own, in one go. No one will answer questions.\n\n- Follow AGENTS.md: red/green commits, a changeset if the package changes.\n- Commit all your work on the current branch. Don't push, and don't open a PR: the loop does both.\n- Leave the task file where it is: the loop moves it to done/.\n- Your final message is used as the PR description, as is. Make it only the PR description, following the tj-meta-pull-request-description skill.\n\nThe task, from project-md/delivery/tasks/4700_run-parameter-overrides.md:\n\n---\nharness: claude-code\nmodel: opus\neffort: medium\n---\n\n<!--\n🤖\nThis file was created with AI\n\nHarness: Claude Code\nModel: claude-opus-5-5\nSession Id: session_01LCLeLjFb1Gy2NHaFDTB6tk\nSupervising engineer: David Johnston\n\nSplit from PR #218's roadmap plan.\n\nHumans: add your notes here\n-->\n\n# 4700: Parameter overrides on `run`\n\nReplace any of a test case's parameter lists for one execution, without editing the file.\n\nRoadmap item 19.\n\n## Version bump type\n\nminor\n\n## Artifacts\n\nOne flag per field of the test case, on `run`, `plan` and `build`:\n\n- `--base-image`\n- `--code-state`\n- `--prompt-set`\n- `--harness-model`\n- `--initial-prompt`\n- `--iterations`\n\n1. A flag replaces that list; it doesn't add to it. Values are comma-separated.\n2. Names are checked as the test case's are, e.g. an unknown code state fails before anything builds.\n3. `plan` and `build` take the same flags, so an override can be previewed.\n4. The execution records the overrides, so `show` and `executions` say it wasn't the test case as written.\n\nOut of scope: `--task`.\n\n## Example CLI Output\n\n```sh\n$ thunderjar run compare-models --harness-model claude-code-2.1.326/haiku,opencode-1.19.5/haiku\n$ thunderjar run compare-models --code-state thunderjar-main --prompt-set none --iterations 3\n\n$ thunderjar plan compare-models --code-state nope\nUnknown code state \"nope\". Known: thunderjar-main, thunderjar-start, …\n```\n\n## Tests\n\n- Fixture + stdout tests of `plan` with each flag, and with an unknown name.\n- `run --dry-run` tests that the overrides are recorded.\n\n## Human interventions\n\nNone.\n";

export default declareInitialPrompt({
  applyParameter: () => writePrompt(prompt),
  timeoutSeconds: 3600,
});
