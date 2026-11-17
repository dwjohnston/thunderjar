import { declareMeasurement } from "thunderjar-published";

export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  metrics: { exists: { stat: "rate" } },
});
