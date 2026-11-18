import { declareMeasurement } from "thunderjar-published";

// Does the repository still type-check with the new test case in it?
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  metrics: { typeChecks: { stat: "rate", better: "higher" } },
});
