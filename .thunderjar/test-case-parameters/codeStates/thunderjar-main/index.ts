import { declareCodeState } from "thunderjar";

// The project's repository at a commit on main, with its dependencies installed, so measurements
// can run its typecheck and tests. The commit must be pushed, so the build can fetch it.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "88f0e6fd7b1bf5af547dd98c2ba64a05afa1ab48",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile`,
});
