import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's first commit (tag fixture-scenario-4-first).
export default declareCodeState({
  config: { commit: "65bcb92cc069821e4695433b11582962ee6d68bd" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtureTests/scenario_4_git_project/fixtures/project && npm ci`,
});
