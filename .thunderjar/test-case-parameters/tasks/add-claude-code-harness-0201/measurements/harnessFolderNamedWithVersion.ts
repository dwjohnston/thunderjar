import { declareMeasurement } from "thunderjar";

// The repo's convention, as init scaffolds it: the folder is named for the harness and its version.
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "fixtures/02_regular/0201_minimal_existing_setup/project/.thunderjar/test-case-parameters/harnessModels/claude-code-2.1.311/index.ts" },
  aggregate: ["rate"],
});
