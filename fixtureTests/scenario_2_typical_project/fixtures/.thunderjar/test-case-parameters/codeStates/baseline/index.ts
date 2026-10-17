import { declareCodeState } from "thunderjar";

// Copies files/ beside this declaration into /workspace: package.json and an empty lockfile, so
// `npm ci` needs no network. No git: editing a file here changes the parameter hash.
export default declareCodeState({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/files/ /workspace/\nRUN npm ci`,
});
