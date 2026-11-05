import { declareHarness } from "thunderjar";

// A fake agent whose script is kept in its files/ folder, and copied into the image from ctx.dir.
// notes.md, beside this file, is not in files/, so it never reaches the build.
export default declareHarness({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/scripts/ /opt/fake-scripted/`,
  cli: (ctx) => `sh /opt/fake-scripted/agent.sh ${ctx.resultPath}`,
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
