import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
