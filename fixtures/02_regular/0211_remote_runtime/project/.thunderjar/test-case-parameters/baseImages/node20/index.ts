import { declareBaseImage } from "thunderjar";

// With bun, which the templateTest measurement runs its tests with, and a git identity, so the
// agent and a prompt set can commit. `--system`, so a harness that runs as another user has it too.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\
  && git config --system user.email agent@thunderjar.invalid`,
});
