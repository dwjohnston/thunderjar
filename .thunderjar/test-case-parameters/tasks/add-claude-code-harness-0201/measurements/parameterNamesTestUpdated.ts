import { declareMeasurement } from "thunderjar";

// Whether the fixture's type test changed at all, committed or not. What the change should be is
// left open for now.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "! git diff --quiet 88f0e6fd7b1bf5af547dd98c2ba64a05afa1ab48 -- fixtures/02_regular/0201_minimal_existing_setup/parameterNames.test.ts" },
  aggregate: ["rate"],
});
