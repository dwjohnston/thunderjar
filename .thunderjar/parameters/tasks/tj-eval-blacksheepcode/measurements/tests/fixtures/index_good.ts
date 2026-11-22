import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/blacksheepcode.git" },
  resolve: async (config, ctx) => {
    const lines = (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/tags/tj-codestate-1`)).split("\n");
    return lines[0]!.split("\t")[0]!;
  },
  applyParameter: (config, ctx) => `RUN git clone ${config.repo} /workspace && git -C /workspace checkout ${ctx.resolved}`,
});
