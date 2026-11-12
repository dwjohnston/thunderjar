import { declareConfig, postgresStore, sqliteStore } from "thunderjar-published";

// Set THUNDERJAR_REMOTE=1 to run on Fly.io, with images in ghcr and run data in Supabase. The
// `/slow-tests` PR comment does that in CI. Without it, everything stays on this machine.
const remote = Bun.env.THUNDERJAR_REMOTE === "1";

export default declareConfig(
  remote
    ? {
        // Prerun and postrun images are pushed here, and the Fly daemon pulls them from here.
        // Needs `docker login ghcr.io` with a token that can write packages.
        imageStore: { repository: Bun.env.THUNDERJAR_IMAGE_REPOSITORY || "ghcr.io/dwjohnston/thunderjar-images" },
        // Supabase Postgres. Use its pooler URL: the direct one is IPv6 only, and GitHub's runners aren't.
        runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL" }),
        // Containers run on a Docker daemon on a Fly machine. fly-runtime.sh sizes it for the run
        // before, and stops it after. Both scripts need FLYIO_TOKEN.
        runtime: {
          command: ["./.thunderjar/fly-docker.sh"],
          concurrency: 16,
          beforeRun: ["./.thunderjar/fly-runtime.sh", "up"],
          afterRun: ["./.thunderjar/fly-runtime.sh", "down"],
        },
        build: { concurrency: 3 },
      }
    : {
        // Images stay in the local Docker daemon.
        imageStore: null,
        // Runs are recorded in a local file.
        runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
        // Up to three prerun images build at once: the test cases here have three or four harness/model
        // pairs each. No runtime: containers run on the local Docker daemon, one at a time unless
        // `run --concurrency <n>` says otherwise.
        build: { concurrency: 3 },
      },
);
