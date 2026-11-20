import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that tries to sandbox itself, as Claude Code's bubblewrap sandbox does: in a user
// namespace of its own, with its own mounts and processes. It replies whether it could.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        `if unshare --user --map-root-user --mount --pid --fork true; then reply=sandboxed; else reply="no sandbox"; fi` +
        ` && echo "{\\"reply\\":\\"$reply\\"}" > /thunderjar/result.json`,
      ),
    ].join("\n"),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
