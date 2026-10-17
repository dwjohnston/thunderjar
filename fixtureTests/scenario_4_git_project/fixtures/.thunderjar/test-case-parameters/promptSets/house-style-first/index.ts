import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at the first commit.
export default declarePromptSet({
  config: { commit: "65bcb92cc069821e4695433b11582962ee6d68bd" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtureTests/scenario_4_git_project/fixtures/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
