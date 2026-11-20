/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { declareTestCase } from "thunderjar";

// A fake agent given a key, by its requiredEnv, and more variables, by its base image's run options:
// its postrun image must hold none of their values, and keep the base image's own.
export default declareTestCase({
  baseImage: ["node20-env"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-keyed/fake-model-small-001"],
  task: "sandbox",
  initialPrompt: ["plain"],
  iterations: 1,
});
