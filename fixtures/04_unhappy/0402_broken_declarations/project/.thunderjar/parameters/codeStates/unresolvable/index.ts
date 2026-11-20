import { declareCodeState } from "thunderjar";

// Looks up a branch that isn't there.
export default declareCodeState({
  config: { branch: "no-such-branch" },
  resolve: (config) => {
    throw new Error(`no branch named ${config.branch}`);
  },
  applyParameter: (_config, ctx) => `RUN echo ${ctx.resolved}`,
});
