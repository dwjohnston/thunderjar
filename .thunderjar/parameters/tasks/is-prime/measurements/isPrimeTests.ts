import { declareMeasurement } from "thunderjar-published";

export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: { passRate: { stat: "mean" } },
});
