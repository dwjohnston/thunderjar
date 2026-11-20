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

// A test case that gives its agent variables of its own: two with values, one awkward to quote,
// which its postrun image keeps, and a secret, from the shell, which it mustn't.
export default declareTestCase({
  baseImage: ["alpine"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-env-reader/fake-model-small-001"],
  task: "sandbox",
  initialPrompt: ["plain"],
  iterations: 1,
  env: {
    FAKE_TEST_CASE_SETTING: "test",
    FAKE_TEST_CASE_AWKWARD: 'kept: "quoted", $HOME, a \\ backslash and 100%',
  },
  secretEnv: ["FAKE_TEST_CASE_SECRET"],
});
