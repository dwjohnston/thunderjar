import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  // GITHUB_TOKEN, for the private code state to clone with. Docker reads it as it builds: it's
  // never written to an image, the run data, or any hash.
  build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true },
});
