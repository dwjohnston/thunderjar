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

// A careless fake agent that needs FAKE_HARNESS_KEY, and writes it, and FAKE_TEST_CASE_SECRET, into
// files of its workspace: its key into a log line, both into a .env it creates. So its postrun
// image holds both values in its files. It replies `leaked`.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `echo "connecting with key $FAKE_HARNESS_KEY" > /workspace/agent.log` +
        ` && echo "KEY=$FAKE_HARNESS_KEY" > /workspace/.env` +
        ` && echo "SECRET=$FAKE_TEST_CASE_SECRET" >> /workspace/.env` +
        ` && echo '{"reply":"leaked"}' > /thunderjar/result.json`,
      ),
    ].join("\n"),
  requiredEnv: ["FAKE_HARNESS_KEY"],
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
