import { declareMeasurement } from "thunderjar";

export default declareMeasurement({ instrument: "grep", config: { glob: "**/*.ts" }, aggregate: ["max"] });
