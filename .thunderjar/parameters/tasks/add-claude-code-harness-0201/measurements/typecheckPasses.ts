import { declareMeasurement } from "thunderjar-published";

export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun run typecheck" },
  aggregate: ["rate"],
});
