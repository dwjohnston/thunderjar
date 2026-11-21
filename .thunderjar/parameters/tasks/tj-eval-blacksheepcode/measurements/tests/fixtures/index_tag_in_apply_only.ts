import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/blacksheepcode.git" },
  resolve: async (config, ctx) => (await ctx.exec(`git ls-remote ${config.repo} HEAD`)).split("\t")[0]!,
  applyParameter: (config) => `RUN git clone ${config.repo} /workspace && git -C /workspace checkout tj-codestate-1`,
});
