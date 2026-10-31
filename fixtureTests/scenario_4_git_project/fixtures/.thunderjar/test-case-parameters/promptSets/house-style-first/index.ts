import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at the first commit.
export default declarePromptSet({
  config: { commit: "523984c7fd72f047265ab89ce5901605af6acb2b" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtureTests/scenario_4_git_project/fixtures/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
