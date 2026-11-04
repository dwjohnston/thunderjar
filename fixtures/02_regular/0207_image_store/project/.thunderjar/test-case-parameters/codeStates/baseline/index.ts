import { declareCodeState } from "thunderjar";

// An empty /workspace. The project wasn't a git repository when `thunderjar init` ran. Once it is,
// check a commit of it out into /workspace:
//
//   import { checkoutCommit, declareCodeState } from "thunderjar";
//
//   export default declareCodeState({
//     config: { commit: "<a commit hash>" },
//     applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),
//   });
export default declareCodeState({});
