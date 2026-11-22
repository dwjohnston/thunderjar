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

// The ralph loop's prompt from capture 8ee05f73-c2db-4a37-a34b-e588c51e1262, word for word.
const prompt = "You are one iteration of a ralph loop. Do the task below, on your own, in one go. No one will answer questions.\n\n- Follow AGENTS.md: red/green commits, a changeset if the package changes.\n- Commit all your work on the current branch. Don't push, and don't open a PR: the loop does both.\n- Leave the task file where it is: the loop moves it to done/.\n- Your final message is used as the PR description, as is. Make it only the PR description, following the tj-meta-pull-request-description skill.\n\nThe task, from project-md/delivery/tasks/5000_checkout.md:\n\n---\nharness: claude-code\nmodel: opus\neffort: medium\n---\n\n<!--\n🤖\nThis file was created with AI\n\nHarness: Claude Code\nModel: claude-opus-5-5\nSession Id: session_01LCLeLjFb1Gy2NHaFDTB6tk\nSupervising engineer: David Johnston\n\nSplit from PR #218's roadmap plan.\n\nHumans: add your notes here\n-->\n\n# 5000: `checkout <run>`\n\nBring a container run's end state back, to inspect what happened. Replaces the planned `restore` command.\n\nRoadmap item 27.\n\n## Version bump type\n\nminor\n\n## Artifacts\n\nAdds `checkout`.\n\n1. Default: a local branch.\n   - The agent's commits, plus a commit of anything it left uncommitted, so the branch is the whole end state.\n2. `--shell`: `docker run -it` on the postrun image, in the workspace.\n   - Through the configured runtime, so it works on a remote Docker host too.\n3. A purged postrun image fails with that reason.\n4. The branch is `thunderjar/run/<test case>/<execution>/<run>`.\n   - `<run>` is the permutation hash and iteration, without the execution ID the container run ID repeats.\n   - `run/` mirrors `thunderjar/capture/<session>`: the second segment is the kind of branch, so they never collide.\n\n## Example CLI Output\n\n```sh\n$ thunderjar checkout 01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00\nChecked out thunderjar/run/compare-models/01K4X9J2E8MQZ3V7R5T0WABCDE/h4f9a21c8-i00\n```\n\n## Tests\n\n- A read-from-docker-image test (`.docker.test.ts`) that checks out a run and compares the branch's tree with the postrun workspace.\n\n## Human interventions\n\nNone.\n";

export default declareInitialPrompt({
  applyParameter: () => writePrompt(prompt),
  timeoutSeconds: 3600,
});
