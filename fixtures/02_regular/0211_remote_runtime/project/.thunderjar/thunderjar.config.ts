import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  // Tests point THUNDERJAR_DOCKER at the fake Docker; a real project would write e.g. "docker".
  runtime: { command: [process.env.THUNDERJAR_DOCKER ?? "docker", "--context", "cloud"] },
});
