import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's second commit (tag fixture-0301-second).
export default declareCodeState({
  config: { commit: "ad8a952bd73a86c85623d1fbd5da9723ecddc08d" },
  applyParameter: (config, ctx) =>
    `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtures/03_real_git/0301_git_project/project && npm ci --no-audit --no-fund`,
});
