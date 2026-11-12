import { declareMeasurement } from "thunderjar";

// Could the agent sandbox itself?
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "^sandboxed$" },
  metrics: { matches: { stat: "rate" } },
});
