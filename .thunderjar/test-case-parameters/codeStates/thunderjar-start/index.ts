import { declareCodeState } from "thunderjar";

// The project's repository, cloned into /workspace at a commit. The commit must be pushed, so the
// build can fetch it. Pin a commit, never a branch: the same text must always build the same thing.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "a9105a1d494716e04d1229b51040efddfdccc981",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin`,
});
