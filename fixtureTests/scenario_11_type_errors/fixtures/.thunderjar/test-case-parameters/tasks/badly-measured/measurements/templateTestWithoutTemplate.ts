import { declareMeasurement } from "thunderjar";

export default declareMeasurement({ instrument: "templateTest", config: { subject: "**/isPrime.ts" }, aggregate: ["sum"] });
