import { declareBaseImage } from "thunderjar";

// Exports its declaration under a name, not as the default.
export const noDefaultExport = declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
