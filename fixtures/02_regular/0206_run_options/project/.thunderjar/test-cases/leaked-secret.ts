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

// A fake agent that writes its harness's key and its test case's secret into files of its
// workspace, so a test can check they're found before its postrun image is pushed.
export default declareTestCase({
  baseImage: ["alpine"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-leaker/fake-model-small-001"],
  task: "sandbox",
  initialPrompt: ["plain"],
  iterations: 1,
  secretEnv: ["FAKE_TEST_CASE_SECRET"],
});
