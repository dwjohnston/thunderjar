import { declareMeasurement } from "thunderjar";

// Declared as it was before metrics replaced aggregate.
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
});
