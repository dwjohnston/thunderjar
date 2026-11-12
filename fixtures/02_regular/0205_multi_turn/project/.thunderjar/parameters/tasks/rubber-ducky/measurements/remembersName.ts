import { declareMeasurement } from "thunderjar";

// Does the agent's last reply know the ducky's name? Only if its session was resumed.
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "\\bEli\\b" },
  metrics: { matches: { stat: "rate" } },
});
