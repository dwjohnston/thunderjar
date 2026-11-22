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

// A fake agent that needs FAKE_HARNESS_KEY. It replies with whether it saw each variable it was run
// with, `set` or nothing, never their values: its key, and FAKE_RUN_OPTION_KEY and FAKE_OVERRIDDEN,
// which base image node20-env's run options pass.
export default declareHarness({
  models: { "fake-model-small-001": [], "fake-model-large-001": [] },
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `reply="key \${FAKE_HARNESS_KEY+set}, run option \${FAKE_RUN_OPTION_KEY+set}, overridden \${FAKE_OVERRIDDEN+set}"` +
        ` && echo "{\\"reply\\":\\"$reply\\"}" > /thunderjar/result.json`,
      ),
    ].join("\n"),
  requiredEnv: ["FAKE_HARNESS_KEY"],
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
