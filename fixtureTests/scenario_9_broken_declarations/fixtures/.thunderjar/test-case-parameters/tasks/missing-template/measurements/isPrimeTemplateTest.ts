import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "templateTest",
  // The template beside this file is isPrime.test.template.ts.
  config: { subject: "**/isPrime.ts", template: "./isPrime.tset.template.ts" },
  aggregate: ["sum"],
});
