import { declareBaseImage } from "thunderjar";

// Run options that would take over what Thunderjar does itself.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
  runOptions: ["--rm", "--entrypoint=bash"],
});
