import { declareConfig, postgresStore, sqliteStore } from "thunderjar-published";

// Set THUNDERJAR_REMOTE=1 to run on Fly.io, with images in ghcr and run data in Supabase. The
// `/slow-tests` PR comment does that in CI. Without it, everything stays on this machine.
const remote = Bun.env.THUNDERJAR_REMOTE === "1";
// With THUNDERJAR_RUN_DATA=sqlite as well, a remote run records its data in the local SQLite file
// instead of Supabase: for machines that can't reach Postgres, e.g. a sandbox that only allows HTTPS.
const localRunData = Bun.env.THUNDERJAR_RUN_DATA === "sqlite";
// With THUNDERJAR_ON_RUNTIME=1 as well, a remote execution runs on the Fly machine itself, in a
// runner: a container there, with Thunderjar and this folder, that runs the containers, measures
// them and writes the run data. `run` only builds, submits and follows. The runner logs in to ghcr
// with GHCR_USER and GHCR_TOKEN, sent to it with the model keys and THUNDERJAR_DB_URL as it starts.
const onRuntime = Bun.env.THUNDERJAR_ON_RUNTIME === "1";
const sqlite = sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" });

export default declareConfig(
  remote
    ? {
        // Prerun and postrun images are pushed here, and the Fly daemon pulls them from here.
        // Needs `docker login ghcr.io` with a token that can write packages.
        imageStore: { repository: Bun.env.THUNDERJAR_IMAGE_REPOSITORY || "ghcr.io/dwjohnston/thunderjar-images" },
        // Supabase Postgres. Use its pooler URL: the direct one is IPv6 only, and GitHub's runners aren't.
        runDataStore: localRunData ? sqlite : postgresStore({ urlEnv: "THUNDERJAR_DB_URL" }),
        // Containers run on a Docker daemon on a Fly machine. fly-runtime.sh starts and sizes it for
        // the execution before, and releases it after. The machine stops itself after an hour idle
        // (FLY_IDLE_MINUTES). Both scripts need FLYIO_TOKEN.
        runtime: {
          command: ["./.thunderjar/fly-docker.sh"],
          concurrency: 16,
          beforeExecution: ["./.thunderjar/fly-runtime.sh", "up"],
          afterExecution: ["./.thunderjar/fly-runtime.sh", "down"],
          // Spread, so it type-checks against thunderjar-published, which doesn't know `runner` yet.
          ...(onRuntime && { runner: { registryLogin: { usernameEnv: "GHCR_USER", passwordEnv: "GHCR_TOKEN" } } }),
        },
        build: { concurrency: 3 },
      }
    : {
        // Images stay in the local Docker daemon.
        imageStore: null,
        // Runs are recorded in a local file.
        runDataStore: sqlite,
        // Up to three prerun images build at once: the test cases here have three or four harness/model
        // pairs each. No runtime: containers run on the local Docker daemon, one at a time unless
        // `run --concurrency <n>` says otherwise.
        build: { concurrency: 3 },
      },
);
