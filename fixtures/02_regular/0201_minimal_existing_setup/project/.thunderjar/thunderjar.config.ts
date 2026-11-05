import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  // Images stay in the local Docker daemon. To push them to a registry, name its repository,
  // e.g. { repository: "ghcr.io/your-org/thunderjar-images" }, and `docker login` to it.
  imageStore: null,
  // Run results go to a local SQLite file. To share them between machines, e.g. CI and your
  // laptop, use a Postgres database instead, with its URL in an environment variable:
  //   runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL" }),
  // and import postgresStore from "thunderjar".
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
