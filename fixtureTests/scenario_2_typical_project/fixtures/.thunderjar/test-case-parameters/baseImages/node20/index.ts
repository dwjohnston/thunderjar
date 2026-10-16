import { declareBaseImage } from "thunderjar";

export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
