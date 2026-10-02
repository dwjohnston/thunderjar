# Setup and Configure

Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.

## Credentials

Each [harness](064-harness.md#requiredenv-credentials) declares the names of the
environment variables its agent needs (`requiredEnv`). The user exports them in the shell
or CI secret store that runs Thunderjar. Thunderjar passes only those variables into that
harness's containers, and fails before building anything if one is unset.

`thunderjar.config.ts` has no environment section, and no secret is ever written to a
config file, an image or the run data store.

## Open questions

- Harnesses whose required variables depend on the model's provider (Bedrock, Vertex).
  v1 declares one harness per provider.
