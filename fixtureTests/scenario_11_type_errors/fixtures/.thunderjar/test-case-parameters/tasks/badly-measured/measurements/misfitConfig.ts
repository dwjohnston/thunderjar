import { declareMeasurement } from "thunderjar";

export default declareMeasurement({ instrument: "fileCreated", config: { path: "isPrime.ts" }, aggregate: ["rate"] });
