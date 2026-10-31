// Preloaded before every `bun test` run (bunfig.toml). Docker is never reached from a test
// unless the test asks for it by name: every Docker a command makes, and every CLI a test
// spawns (which inherits this environment), runs the recording fake in its place —
// spec/120-test-boundaries.md#2-cli-with-recording-adapters. The Docker image tests pass
// `dockerCli("docker")` themselves.

import { FAKE_DOCKER } from "./fake-docker.ts";

process.env.THUNDERJAR_DOCKER = FAKE_DOCKER;
delete process.env.FAKE_DOCKER_DIR;
