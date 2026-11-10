import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "templateTest",
  config: { subject: "**/isPrime.ts", template: "./templates/isPrime.test.ts.template" },
  aggregate: ["sum", "mean"],
});
