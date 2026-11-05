import { declareBaseImage } from "thunderjar";

// With bun, which the templateTest measurement runs its tests with.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
RUN npm install --global bun@1.3.14`,
});
