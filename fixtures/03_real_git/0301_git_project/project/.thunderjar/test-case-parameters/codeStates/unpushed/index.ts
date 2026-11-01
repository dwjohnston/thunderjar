import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git, but a commit this repository doesn't have, as if it had never been pushed.
export default declareCodeState({
  config: { commit: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" },
  applyParameter: (config, ctx) =>
    `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtures/03_real_git/0301_git_project/project && npm ci --no-audit --no-fund`,
});
