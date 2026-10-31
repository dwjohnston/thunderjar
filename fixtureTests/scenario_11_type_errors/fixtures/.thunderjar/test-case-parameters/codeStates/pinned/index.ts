import { checkoutCommit, declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { commit: "a1b2c3", install: "npm ci" },
  applyParameter: (config, ctx) => `${checkoutCommit(ctx, config.commit)}\nRUN ${config.install}`,
});
