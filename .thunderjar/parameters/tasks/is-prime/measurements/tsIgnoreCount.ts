import { declareMeasurement } from "thunderjar-published";

export default declareMeasurement({
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  metrics: { count: { stat: "mean" } },
});
