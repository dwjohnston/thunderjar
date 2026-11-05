import { declareBaseImage } from "thunderjar";

// node20, with its agent containers let make user namespaces, as Claude Code's bubblewrap sandbox
// does: Docker's default seccomp profile blocks it, and so, on hosts with AppArmor, does its profile.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
  runOptions: ["--security-opt", "seccomp=unconfined", "--security-opt", "apparmor=unconfined"],
});
