import { declareCodeState } from "thunderjar-published";

// The project's repository, cloned into /workspace at a commit. The commit must be on a branch,
// e.g. main, so a clone fetches it: one that was only on a rebased or deleted branch can't be
// checked out. Pin a commit, never a branch: the same text must always build the same thing.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "530f47780718b56122d2fce6a8d87011632cf546",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin`,
});
