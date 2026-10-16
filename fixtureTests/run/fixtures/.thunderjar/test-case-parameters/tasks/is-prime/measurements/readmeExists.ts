import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/README.md" },
  aggregate: ["rate"],
});
