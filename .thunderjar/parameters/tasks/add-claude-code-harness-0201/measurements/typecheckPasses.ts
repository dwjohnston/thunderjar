import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  metrics: { passes: { stat: "rate" } },
});
