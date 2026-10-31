import { checkoutCommit, declareCodeState } from "thunderjar";

// Real git: this repository at the project's first commit (tag fixture-scenario-4-first).
export default declareCodeState({
  config: { commit: "523984c7fd72f047265ab89ce5901605af6acb2b" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN cd fixtureTests/scenario_4_git_project/fixtures/project && npm ci`,
});
