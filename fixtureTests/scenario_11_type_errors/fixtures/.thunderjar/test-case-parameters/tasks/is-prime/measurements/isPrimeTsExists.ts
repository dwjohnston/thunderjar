import { declareMeasurement } from "thunderjar";

export default declareMeasurement({ instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate", "count"] });
