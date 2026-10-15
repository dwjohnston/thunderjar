import { declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector((raw, ctx) => {
  return { outcome: "unavailable", reason: "notReported" };
});
