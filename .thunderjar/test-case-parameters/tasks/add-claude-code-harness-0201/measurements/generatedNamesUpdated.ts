import { declareMeasurement } from "thunderjar";

// The fixture checks in its generated names, so adding a harness means running generate again.
export default declareMeasurement({
  instrument: "grep",
  config: { glob: "fixtures/02_regular/0201_minimal_existing_setup/project/.thunderjar/_generated/parameterNames.d.ts", pattern: "claude-code" },
  aggregate: ["mean"],
});
