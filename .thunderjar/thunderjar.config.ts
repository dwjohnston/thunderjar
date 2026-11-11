import { declareConfig, sqliteStore } from "thunderjar-published";

export default declareConfig({
  // Images stay in the local Docker daemon. To push them to a registry, name its repository,
  // e.g. { repository: "ghcr.io/your-org/thunderjar-images" }, and `docker login` to it.
  imageStore: null,
  // Runs are recorded in a local file. For a database shared with CI, use postgresStore({ urlEnv }).
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  // Up to three prerun images build at once: the test cases here have three or four harness/model
  // pairs each. No runtime: containers run on the local Docker daemon, one at a time unless
  // `run --concurrency <n>` says otherwise.
  build: { concurrency: 3 },
});
