import { declareMeasurement } from "thunderjar";

// Whether the fixture's type test changed at all, committed or not. What the change should be is
// left open for now.
const TEST_FILE = "fixtures/02_regular/0201_minimal_existing_setup/parameterNames.test.ts";

export default declareMeasurement({
  instrument: "filesChanged",
  config: { glob: TEST_FILE },
  metrics: { passes: { stat: "rate", score: (v) => v.modified.includes(TEST_FILE) } },
});
