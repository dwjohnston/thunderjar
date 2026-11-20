import { declarePromptSet } from "thunderjar";

// Copies a file from the harness's folder in the build context, which only the harness may use.
export default declarePromptSet({
  applyParameter: () => "COPY parameters/harness/install.sh /workspace/",
});
