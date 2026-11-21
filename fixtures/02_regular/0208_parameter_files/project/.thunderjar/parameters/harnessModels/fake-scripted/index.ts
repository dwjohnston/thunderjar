import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent whose script is kept in its files/ folder, and copied into the image from ctx.dir.
// notes.md, beside this file, is not in files/, so it never reaches the build.
export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      `COPY ${ctx.dir}/scripts/ /opt/fake-scripted/`,
      writeModel(ctx.modelId),
      writeRunScript(
        `sh /opt/fake-scripted/agent.sh /thunderjar/result.json`,
      ),
    ].join("\n"),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
