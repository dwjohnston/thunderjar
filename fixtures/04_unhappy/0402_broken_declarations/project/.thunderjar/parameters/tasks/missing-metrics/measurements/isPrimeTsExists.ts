import { declareMeasurement } from "thunderjar";

// No metrics, so nothing would be read from the measure.
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
});
