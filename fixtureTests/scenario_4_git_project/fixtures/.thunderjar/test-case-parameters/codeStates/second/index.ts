import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's second commit (tag fixture-scenario-4-second).
export default declareCodeState({
  config: { commit: "5f52f9e08051a67c5ca0d630e2ce586a62819778" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtureTests/scenario_4_git_project/fixtures/project && npm ci`,
});
