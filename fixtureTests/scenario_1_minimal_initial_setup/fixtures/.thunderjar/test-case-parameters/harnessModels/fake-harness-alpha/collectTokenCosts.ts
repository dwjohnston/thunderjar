import { declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector((_raw, _ctx) => {
  return { outcome: "unavailable", reason: "notReported" };
});
