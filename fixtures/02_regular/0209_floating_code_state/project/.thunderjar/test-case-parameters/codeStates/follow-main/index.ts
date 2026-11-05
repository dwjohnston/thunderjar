import { declareCodeState } from "thunderjar";

// The sandbox repository at the latest commit of its main branch, looked up each execution. The
// commit is pinned in the Dockerfile, so the hash changes only when main moves. `--exit-code`, so
// a missing branch fails, rather than resolving to nothing.
export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git", branch: "main" },
  resolve: async (config, ctx) =>
    (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`)).split("\t")[0] as string,
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
});
