import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's first commit (tag fixture-0301-first).
export default declareCodeState({
  config: { commit: "2dcf1912eb39b8b0ee181367b8564646886de132" },
  applyParameter: (config, ctx) =>
    `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtures/03_real_git/0301_git_project/project && npm ci --no-audit --no-fund`,
});
