/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// `thunderjar run`, as a user runs it: the real CLI, in a fixture scenario. Only that the command
// line reaches `runCommand` with real services, and what comes out. What `run` does at each step is
// tested with fakes, in src/execution/run/.
import { afterEach, describe, expect, test } from "bun:test";
import { sqliteStore, storeFileIn } from "../../../store/runDataStore.ts";
import { REPO_ROOT } from "../../../testing/scenario.ts";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { dataDir, KEY, removeDataDirs } from "../../../testing/runData.ts";
import { scenario } from "../../../testing/scenario.ts";

afterEach(removeDataDirs);

describe("run --dry-run", () => {
  test("shows the plan, each container and each image's Dockerfile, and asks Docker nothing", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    expect(lines[0]).toBe("Execution <ULID>");
    expect(lines).toContain("Matrix shape: 1/1/1/2/1 (2 permutations)");
    expect(lines).toContain("Permutation 1: prerun image thunderjar-prerun:ded54607");
    expect(lines).toContain("  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1");
    expect(lines).toContain("    env:      FAKE_HARNESS_KEY");
    expect(lines).toContain("    command:  sh /thunderjar/thunderjar-run.sh");
    expect(lines).toContain("# thunderjar-prerun:ded54607");
    expect(lines).toContain("FROM node:20-bookworm");
    expect(await docker.commands()).toEqual([]);
  });

  test("--json: the manifest alone on stdout", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run", "--json"], { env: KEY });

    expect(exitCode).toBe(0);
    const { manifest } = JSON.parse(stdout);
    expect(manifest.testCase).toBe("two-harnesses");
    expect(manifest.images.map(({ image }: { image: string }) => image)).toEqual(["thunderjar-prerun:ded54607", "thunderjar-prerun:e4f0784f"]);
    expect(manifest.runs.map(({ container }: { container: string }) => container)).toEqual(["thunderjar-run-<ULID>-1-1", "thunderjar-run-<ULID>-2-1"]);
  });

  test("with --build-only: an error, and nothing on stdout", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run", "--build-only"], { env: KEY });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: --dry-run and --build-only can't be given together: --dry-run stops before anything is built.\n");
    expect(exitCode).toBe(1);
  });

  test("a variable a harness needs is unset: an error, exit 1", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"], { env: { FAKE_HARNESS_KEY: "" } });

    expect(stdout).toBe("");
    expect(stderr).toContain("FAKE_HARNESS_KEY");
    expect(exitCode).toBe(1);
  });
});

test("run --build-only builds the prerun images and runs nothing", async () => {
  await using docker = await fakeDocker();

  const { stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--build-only"], { env: { ...docker.env, ...KEY } });

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(await docker.images()).toEqual(["thunderjar-prerun:ded54607", "thunderjar-prerun:e4f0784f"]);
  expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
});

test("run builds, runs each container, measures it and records it, through the docker binary", async () => {
  await using docker = await fakeDocker();
  const dir = dataDir();

  const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", dir], { env: { ...docker.env, ...KEY } });

  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const lines = stdout.split("\n");
  expect(lines[0]).toBe("Execution <ULID>");
  expect(lines).toContain(" 1/2  iteration 1/1  fake-harness-alpha | plain  done (<duration>, $0.061)");
  expect(lines).toContain("Runs: 2 finished");
  expect(await docker.images()).toEqual(expect.arrayContaining([expect.stringMatching(/^thunderjar-postrun:.*-1-1$/), expect.stringMatching(/^thunderjar-postrun:.*-2-1$/)]));
  // Each container is removed once its run is recorded and measured.
  expect(await docker.containers()).toEqual([]);

  const store = sqliteStore(storeFileIn(dir));
  const [execution] = await store.listExecutions();
  expect(execution?.status).toBe("complete");
  const containerRuns = await store.containerRunsOf(execution!.executionId);
  expect(containerRuns.map(({ execution }) => execution.exitCode)).toEqual([0, 0]);
  expect(containerRuns.map(({ result }) => result?.isPrimeTests?.outcome)).toEqual([
    { outcome: "measured", data: { passed: 3, total: 5 } },
    { outcome: "measured", data: { passed: 5, total: 5 } },
  ]);
});

test("run --help says what --json leaves on each stream: the result at the end, and where the logs are", async () => {
  const { stdout } = await thunderjar(scenario("0202"), ["run", "--help"]);

  const json = stdout.split("\n").find((line) => line.trimStart().startsWith("--json"));
  expect(json).toContain("when the command ends");
  expect(json).not.toContain("Progress goes to stderr");
});

test("with a runtime in the config, only the registry checks stay on the host: everything else goes through the runtime's command", async () => {
  await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

  const { exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: { ...docker.env, ...KEY } });

  expect(exitCode).toBe(0);
  const commands = await docker.commands();
  const onRuntime = "docker --context cloud ";
  const onHost = commands.filter((command) => !command.startsWith(onRuntime));
  expect(onHost[0]).toBe("docker login ghcr.io");
  expect(onHost.slice(1).every((command) => command.startsWith("docker manifest inspect ghcr.io/acme/thunderjar-images:prerun-h"))).toBe(true);
  expect(onHost.length).toBeGreaterThan(1);
  for (const verb of ["build", "push", "run", "commit"]) {
    expect(commands.filter((command) => command.startsWith(`${onRuntime}${verb} `)).length).toBeGreaterThan(0);
  }
});

test("run asked to stop while it builds: builds no other image, and exits 143", async () => {
  // Each build takes a second.
  const images = ["thunderjar-prerun:ded54607", "thunderjar-prerun:e4f0784f"];
  await using docker = await fakeDocker({ slow: images });
  const builds = async () => (await docker.commands()).filter((command) => command.startsWith("docker build "));
  const running = Bun.spawn(["bun", `${REPO_ROOT}/src/cli/index.ts`, "run", "two-harnesses", "--data-dir", dataDir()], {
    cwd: scenario("0202"),
    env: { ...Bun.env, TMPDIR: TMP_DIR, THUNDERJAR_LOG_FILE: `${TMP_DIR}/logs/${crypto.randomUUID()}.log`, ...docker.env, ...KEY },
    stdout: "ignore",
    stderr: "pipe",
  });

  while ((await builds()).length === 0) await Bun.sleep(20);
  running.kill("SIGTERM");

  expect(await running.exited).toBe(143);
  expect(await new Response(running.stderr).text()).toContain("Error: Interrupted (SIGTERM): stopped before any container ran.");
  expect((await builds()).length).toBe(1);
  expect(await docker.images()).toEqual([images[0] as string]);
});
