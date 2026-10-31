import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's second commit (tag fixture-scenario-4-second).
export default declareCodeState({
  config: { commit: "952687db16b373d58f79f46690f9c5b0aa1aa141" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtureTests/scenario_4_git_project/fixtures/project && npm ci`,
});
