import { declareMeasurement } from "thunderjar-published";

// Any claude-code harness folder in the fixture. fake-harness-alpha is already there.
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "fixtures/02_regular/0201_minimal_existing_setup/project/.thunderjar/parameters/harnessModels/claude-code*/index.ts" },
  metrics: { exists: { stat: "rate" } },
});
