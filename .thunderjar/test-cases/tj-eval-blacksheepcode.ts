import { declareTestCase } from "thunderjar-published";

// Reproduces captured session 49669c7c-0a9d-468d-a0aa-fbeb2bc69840: Claude Code on Opus, asked to add
// a blacksheepcode test case, compared with Haiku and Sonnet.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["tj-eval-blacksheepcode-start"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiku-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",
  ],
  task: "tj-eval-blacksheepcode",
  initialPrompt: ["plain"],
  iterations: 1,
});
