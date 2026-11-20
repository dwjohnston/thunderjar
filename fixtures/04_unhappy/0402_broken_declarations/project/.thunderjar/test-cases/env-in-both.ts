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

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha/fake-model-small-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
  env: { DATABASE_URL: "postgres://localhost/test", NODE_ENV: "test" },
  secretEnv: ["DATABASE_URL"],
});
