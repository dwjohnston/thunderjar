import { declareCodeState } from "thunderjar";

// A private repository, cloned with the build secret "github", mounted for this RUN only.
export default declareCodeState({
  config: { repo: "github.com/acme/private-widgets.git", commit: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a" },
  applyParameter: (config) => `RUN --mount=type=secret,id=github \\
  git clone --quiet "https://x-access-token:$(cat /run/secrets/github)@${config.repo}" /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin`,
});
