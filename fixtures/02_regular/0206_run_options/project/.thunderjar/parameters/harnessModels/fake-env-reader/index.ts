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
import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that replies with what its test case's variables gave it: FAKE_TEST_CASE_SETTING's
// value, which isn't secret, and whether it saw FAKE_TEST_CASE_AWKWARD and FAKE_TEST_CASE_SECRET,
// `set` or nothing, never their values.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `reply="setting $FAKE_TEST_CASE_SETTING, awkward \${FAKE_TEST_CASE_AWKWARD+set}, secret \${FAKE_TEST_CASE_SECRET+set}"` +
        ` && echo "{\\"reply\\":\\"$reply\\"}" > /thunderjar/result.json`,
      ),
    ].join("\n"),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
