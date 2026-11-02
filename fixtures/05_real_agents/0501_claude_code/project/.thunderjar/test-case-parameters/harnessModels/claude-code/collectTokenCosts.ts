import { claudeCodeTokenCosts, declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector((raw) => claudeCodeTokenCosts(raw));
