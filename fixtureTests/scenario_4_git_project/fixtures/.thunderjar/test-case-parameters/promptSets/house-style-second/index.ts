import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at the second commit.
export default declarePromptSet({
  config: { commit: "5f52f9e08051a67c5ca0d630e2ce586a62819778" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtureTests/scenario_4_git_project/fixtures/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
