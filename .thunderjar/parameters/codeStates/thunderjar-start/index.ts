import { codeStateGitCheckout } from "thunderjar";

// The project's repository, cloned into /workspace at tag thunderjar/codestate/thunderjar-start. The tag is looked up
// to its commit, so the Dockerfile pins a SHA: the same text always builds the same thing.
export default codeStateGitCheckout({
  repo: "https://github.com/dwjohnston/thunderjar.git",
  tag: "thunderjar/codestate/thunderjar-start",
});
