import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { commit: "a1b2c3" },
  applyParameter: (config) => `RUN git checkout ${config.sha}`,
});
