import { declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector(
  (_raw, _ctx) => ({ outcome: "unavailable", reason: "notReported" }),
);
