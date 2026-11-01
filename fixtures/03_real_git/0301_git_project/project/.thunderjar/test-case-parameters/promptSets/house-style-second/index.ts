import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at its second commit (tag fixture-0301-second).
export default declarePromptSet({
  config: { commit: "ad8a952bd73a86c85623d1fbd5da9723ecddc08d" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtures/03_real_git/0301_git_project/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
