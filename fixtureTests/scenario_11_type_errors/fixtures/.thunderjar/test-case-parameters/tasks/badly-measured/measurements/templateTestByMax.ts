import { declareMeasurement } from "thunderjar";

export default declareMeasurement({ instrument: "templateTest", config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" }, aggregate: ["max"] });
