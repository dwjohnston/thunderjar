import { declareMeasurement } from "thunderjar-published";

// The expected line: export default declareHarness(claudeCode({ version: "2.1.311" }));
export default declareMeasurement({
  instrument: "grep",
  config: {
    glob: "fixtures/02_regular/0201_minimal_existing_setup/project/.thunderjar/test-case-parameters/harnessModels/claude-code*/index.ts",
    pattern: 'export default declareHarness\\(\\s*claudeCode\\(\\s*\\{\\s*version:\\s*"2\\.1\\.311"\\s*\\}\\s*\\)\\s*\\)',
  },
  aggregate: ["mean"],
});
