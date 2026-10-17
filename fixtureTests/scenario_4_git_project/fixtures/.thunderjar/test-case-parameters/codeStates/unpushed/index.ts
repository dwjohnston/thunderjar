import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git, but a commit this repository doesn't have, as if it had never been pushed.
export default declareCodeState({
  config: { commit: "a1b2c3" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtureTests/scenario_4_git_project/fixtures/project && npm ci`,
});
