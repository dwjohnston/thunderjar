import { declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector(() => ({ outcome: "unavailable", reason: "notReported" }));
