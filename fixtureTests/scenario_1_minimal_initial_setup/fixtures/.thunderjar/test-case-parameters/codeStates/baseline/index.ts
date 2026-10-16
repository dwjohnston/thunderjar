import { declareCodeState } from "thunderjar";

export default declareCodeState({
  commit: "a1b2c3",
  applyParameter: () => `RUN npm ci`,
});
