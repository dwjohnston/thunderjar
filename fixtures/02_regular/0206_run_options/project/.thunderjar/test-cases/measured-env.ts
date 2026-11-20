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

// A fake agent given a key, by its harness's requiredEnv, and the test case's own variables, which
// its measurement must see too: its postrun image keeps env, and blanks the secrets.
export default declareTestCase({
  baseImage: ["alpine"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-keyed/fake-model-small-001"],
  task: "env-measured",
  initialPrompt: ["plain"],
  iterations: 1,
  env: { FAKE_TEST_CASE_SETTING: "test" },
  secretEnv: ["FAKE_TEST_CASE_SECRET"],
});
