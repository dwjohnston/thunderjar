import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "fileCraeted",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
});
