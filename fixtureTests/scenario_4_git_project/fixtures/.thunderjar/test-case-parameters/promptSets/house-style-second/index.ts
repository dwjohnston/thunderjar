import { declarePromptSet } from "thunderjar";

// Real git: the project's prompts/house-style.md as it is at the second commit.
export default declarePromptSet({
  config: { commit: "952687db16b373d58f79f46690f9c5b0aa1aa141" },
  applyParameter: (config, ctx) =>
    `COPY ${ctx.git.show(config.commit, "fixtureTests/scenario_4_git_project/fixtures/project/prompts/house-style.md")} /workspace/HOUSE_STYLE.md`,
});
