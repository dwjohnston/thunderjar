import { declareTestCase } from "thunderjar";

// A test case that builds its harness/model pairs from template strings.
const HARNESS = "claude-code-2.1.326";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-issue-285-start"],
  promptSet: ["none"],
  harnessModel: [`${HARNESS}/claude-haiku-5-5`, `${HARNESS}/claude-sonnet-5-5`, `${HARNESS}/claude-opus-5-5`],
  task: "create-eval-issue-285",
  initialPrompt: ["plain"],
  iterations: 1,
});
