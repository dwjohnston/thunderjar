import { declarePromptSet } from "thunderjar";

// Files from a commit of the project's repository, such as its AGENTS.md or skills, copied into
// /workspace at the same paths, like `git checkout <commit> -- <paths>`. They're left uncommitted.
// Each path is from the repository's root, e.g. "AGENTS.md" or ".agents/skills/review/SKILL.md".
export default declarePromptSet<{ commit: string; paths: string[] }>({
  config: {
    commit: "<a commit hash>",
    paths: [],
  },
  applyParameter: (config, ctx) =>
    config.paths.map((path) => `COPY ${ctx.git.show(config.commit, path)} /workspace/${path}`).join("\n"),
});
