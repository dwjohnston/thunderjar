import { declarePromptSet } from "thunderjar";

// The seed repository's second commit, which adds prompts/ after the code state's commit.
export default declarePromptSet({
  commit: "91ab1db384146db3f605113ab297cf4469a60c9a",
  files: { "prompts/snerk.md": "FAKE_INSTRUCTIONS.md" },
  applyParameter: () => ``,
});
