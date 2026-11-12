import { declareMeasurement } from "thunderjar";

// Did the agent reply like a pirate? fake-harness-alpha does; fake-harness-beta doesn't.
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "\\bArr\\b" },
  metrics: { matches: { stat: "rate" } },
});
