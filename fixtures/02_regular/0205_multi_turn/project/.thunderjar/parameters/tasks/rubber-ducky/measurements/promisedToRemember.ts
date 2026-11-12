import { declareMeasurement } from "thunderjar";

// Did the agent's reply to the first turn promise to remember?
export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: "remember", turn: 1 },
  metrics: { matches: { stat: "rate" } },
});
