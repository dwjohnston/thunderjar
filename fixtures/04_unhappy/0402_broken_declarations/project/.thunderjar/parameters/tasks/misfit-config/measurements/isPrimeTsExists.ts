import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "fileCreated",
  config: { path: "isPrime.ts" },
  metrics: { exists: { stat: "rate" } },
});
