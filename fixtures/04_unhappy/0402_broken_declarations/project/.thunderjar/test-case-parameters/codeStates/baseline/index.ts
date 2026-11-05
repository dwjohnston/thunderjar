import { declareCodeState } from "thunderjar";

// An empty /workspace. The project had no pushed git repository when `thunderjar init` ran. To
// clone one into /workspace at a commit:
//
//   export default declareCodeState({
//     config: {
//       repo: "https://github.com/<owner>/<repo>.git",
//       commit: "<a commit hash>",
//     },
//     applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
//       && git -C /workspace checkout --quiet --detach ${config.commit} \\
//       && git -C /workspace remote remove origin`,
//   });
export default declareCodeState({});
