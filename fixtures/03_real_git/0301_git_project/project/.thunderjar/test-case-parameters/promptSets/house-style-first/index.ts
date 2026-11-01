import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at its first commit (tag fixture-0301-first).
export default declarePromptSet({
  config: { commit: "2dcf1912eb39b8b0ee181367b8564646886de132" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtures/03_real_git/0301_git_project/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
