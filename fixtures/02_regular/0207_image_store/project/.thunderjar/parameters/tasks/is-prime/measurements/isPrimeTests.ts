import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: { passRate: { stat: "mean" } },
});
