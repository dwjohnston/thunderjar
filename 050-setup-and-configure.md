# Setup and Configure

Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.

## Credentials

Each [harness](064-harness.md#requiredenv-credentials) declares the names of the
environment variables its agent needs (`requiredEnv`). The user exports them in the shell
or CI secret store that runs Thunderjar. Thunderjar passes only those variables into that
harness's containers, and fails before building anything if one is unset.

`thunderjar.config.ts` has no environment section, and no secret is ever written to a
config file, an image or the run data store.

## `thunderjar.config.ts`

Global configuration holds the two stores from [070-data-architecture.md](070-data-architecture.md):

```ts
import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./thunderjar/.data/runs.sqlite" }),
});
```

- **`imageStore`** is the registry repository holding prerun and postrun images.
- **`runDataStore`** is a pluggable store behind a small interface (record a container run,
  list executions, fetch a run's results, re-measure). v1 ships only `sqliteStore`. A remote
  backend, e.g. `postgresStore({ urlEnv: "THUNDERJAR_DB_URL" })`, is a later drop-in.
- Container defaults such as concurrency are not in v1.

### Authentication

Three rules, all of the same shape: config names things, never holds secrets.

| What | How it authenticates | Who reads it |
|---|---|---|
| Harness (agent API key) | `requiredEnv` on the harness declaration | Passed into that harness's containers |
| Run data store (remote) | An env var named in the config, holding a connection URL with credentials, e.g. `urlEnv: "THUNDERJAR_DB_URL"` | The Thunderjar process on the host. No container sees it. |
| Image store | The user's existing `docker login` for the registry. Thunderjar holds no registry credentials. In CI the pipeline logs in first. | Docker |

A connection URL (`postgres://user:password@host/db`) is the one near-standard way to
authenticate to a remote database, and the `DATABASE_URL` convention. Cloud IAM tokens and
secrets managers are later store constructors behind the same interface.

## Open questions

- Sharing the run data store between CI and a developer's machine. With only `sqliteStore`
  in v1, the file must be shared by hand (CI artifact, synced directory), which the
  regression triage loop in [040-user-experience.md](040-user-experience.md#regression-triage)
  depends on.
- Whether `plan` and `run` check that the registry accepts a push before building anything.

- Harnesses whose required variables depend on the model's provider (Bedrock, Vertex).
  v1 declares one harness per provider.
