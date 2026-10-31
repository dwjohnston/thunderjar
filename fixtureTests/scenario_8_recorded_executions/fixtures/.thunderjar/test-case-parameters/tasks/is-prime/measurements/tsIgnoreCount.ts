import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  aggregate: ["median", "min", "sum"],
});
