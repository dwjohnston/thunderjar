// `thunderjar run` on a remote runtime (`docker --context cloud`, scenario 0211), through the CLI,
// with the fake Docker: its image store, the runtime's hooks, concurrency and interrupts.
// A file of its own so that `bun test --parallel` runs it in its own worker.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { ExecutionRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar, TMP_DIR } from "../../../testing/cli.ts";
import { FAKE_DOCKER, fakeDocker } from "../../../testing/fakeDocker.ts";
import { REPO_ROOT, scenario } from "../../../testing/scenario.ts";
import { dataDir, readStore, removeDataDirs } from "./runTestSupport.ts";

afterEach(removeDataDirs);

describe("0211 remote runtime", () => {
  const REPOSITORY = "ghcr.io/acme/thunderjar-images";
  const PRERUN = `${REPOSITORY}:prerun-h4799f255`;
  const REMOTE = "docker --context cloud";
  /** The frame's first two lines, for `runs` runs of one permutation, up to `concurrency` at once. */
  const header = (runs: number, concurrency: number) =>
    `Execution <ULID>  example\n  1 permutation, ${runs === 1 ? "1 run" : `${runs} runs`}, up to ${concurrency} at once, images stored in ${REPOSITORY}\n`;
  /** The measures under a run of 0211's fake agent. */
  const MEASURES = `isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   tsIgnoreCount: 1`;
  /** A run's line, and its measures under it. */
  const completed = (run: string, harnessModel = "fake-harness-alpha/fake-model-small-001") => `  ${run}  ${harnessModel}  completed  <duration>  uploaded\n       ${MEASURES}\n`;
  /** `text` with each duration it shows, e.g. `0:01`, as `<duration>`. */
  const timeless = (text: string) => text.replace(/\b\d+:\d\d\b/g, "<duration>");
  /** Where the first command that matches is, in `commands`: -1 if none does. */
  const at = (commands: string[], pattern: RegExp) => commands.findIndex((command) => pattern.test(command));

  test("builds on the runtime and pushes from there, so pulls nothing, then runs, commits, pushes and measures there", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-h0af800ad-i00`;
    expect(timeless(stdout)).toBe(`${header(1, 1)}
Images
  ${PRERUN}  ready

Runs
${completed("1.1")}
1 run: 1 completed
Recorded in <REPO>/fixtures/.tmp/data-<UUID>/runs.sqlite
`);
    const commands = await docker.commands();
    const local = commands.filter((command) => !command.startsWith(REMOTE));
    // Nothing is built, tagged or pushed here: only the login and the image store are asked about.
    expect(local).toEqual([
      "docker login ghcr.io",
      // Not in the image store yet, so it's built.
      `docker manifest inspect ${PRERUN}`,
    ]);
    // Looked for, built, tagged and pushed on the runtime, so it's already there: never pulled.
    expect(commands).toContain(`${REMOTE} image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun`);
    expect(commands.find((command) => command.startsWith(`${REMOTE} build `))).toMatch(/ -t thunderjar-prerun:4799f255 /);
    expect(commands).toContain(`${REMOTE} tag thunderjar-prerun:4799f255 ${PRERUN}`);
    expect(commands).toContain(`${REMOTE} push --quiet ${PRERUN}`);
    expect(commands.some((command) => command.includes(" pull "))).toBe(false);
    // The runtime runs the stored prerun image, pulling it if it must.
    expect(commands.find((command) => command.startsWith(`${REMOTE} run --name`))).toContain(`--pull missing`);
    expect(commands.find((command) => command.startsWith(`${REMOTE} run --name`))).toContain(` ${PRERUN} -c `);
    expect(commands).toContain(`${REMOTE} push --quiet ${postrun}`);
    expect(commands.some((command) => command.startsWith(`${REMOTE} run --rm --interactive`))).toBe(true);
    // Nothing is removed from the runtime: clearing it down is left to whoever runs it.
    expect(commands.some((command) => command.includes(" image rm "))).toBe(false);
    expect(await docker.images()).toEqual(["thunderjar-prerun:4799f255", PRERUN, `thunderjar-postrun:${executionId}-1-1`, postrun]);
  });

  test("logs the runtime's disk usage before and after", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    expect((await docker.commands()).filter((command) => command.startsWith(`${REMOTE} system df`))).toHaveLength(2);
  });

  test("--timings prints how long each phase took, at the end of the frame", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--timings", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const lines = timeless(stdout).split("\n");
    const from = lines.indexOf("Timings");
    expect(from).toBeGreaterThan(lines.findIndex((line) => line.startsWith("Recorded in ")));
    expect(lines.slice(from + 1, -1).map((line) => line.trim().replace(/ {2,}/g, "  "))).toEqual([
      "building prerun images  1×  total <duration>  longest <duration>",
      "pushing prerun images  1×  total <duration>  longest <duration>",
      "running agents  1×  total <duration>  longest <duration>",
      "reading what agents left  1×  total <duration>  longest <duration>",
      "committing postrun images  1×  total <duration>  longest <duration>",
      "pushing postrun images  1×  total <duration>  longest <duration>",
      "measuring  1×  total <duration>  longest <duration>",
    ]);
  });

  test("a prerun image already in the image store is neither built nor pushed again, only pulled into the runtime", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });
    // As on a fresh machine: the image store has it, the local daemon and the runtime don't.
    await $`${FAKE_DOCKER} image rm thunderjar-prerun:4799f255 ${PRERUN}`.env({ ...Bun.env, ...docker.env }).quiet();
    const before = (await docker.commands()).length;

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`\nImages\n  ${PRERUN}  ready\n`);
    expect(stdout).toContain("1 run: 1 completed");
    const commands = (await docker.commands()).slice(before);
    expect(commands).toContain(`docker manifest inspect ${PRERUN}`);
    expect(commands.some((command) => / build /.test(command))).toBe(false);
    expect(commands.some((command) => command.endsWith(`push --quiet ${PRERUN}`))).toBe(false);
    expect(commands).toContain(`${REMOTE} pull --quiet ${PRERUN}`);
  });

  test("a prerun image the image store and the runtime both have is neither built, pushed nor pulled", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });
    const before = (await docker.commands()).length;

    const { stdout, stderr, exitCode, log } = await thunderjar(scenario("0211"), ["run", "example", "--timings", "--data-dir", dataDir()], {
      env: docker.env,
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`\nImages\n  ${PRERUN}  ready\n`);
    // None of these phases happened, so --timings has no row for them.
    expect(stdout).not.toMatch(/building prerun images|pushing prerun images|pulling prerun images/);
    const commands = (await docker.commands()).slice(before);
    // The runtime's images are listed once each, for all of them: those it builds, and those it has from the image store.
    expect(commands.filter((command) => command.startsWith(`${REMOTE} image ls`)).sort()).toEqual([
      `${REMOTE} image ls --format {{.Repository}}:{{.Tag}} ${REPOSITORY}`,
      `${REMOTE} image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun`,
    ]);
    expect(commands.filter((command) => /^docker( --context cloud)? (build|tag \S+ \S+:prerun|push --quiet \S+:prerun|pull|info)\b/.test(command))).toEqual([]);
    expect(log).toContain("prerun image already in the runtime");
  });

  test("a prerun image is pushed if the image store can't say whether it has it", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });
    // The runtime has what it built, but not the stored reference, so the image store is asked.
    await $`${FAKE_DOCKER} image rm ${PRERUN}`.env({ ...Bun.env, ...docker.env }).quiet();
    // Every `manifest inspect` now fails, as if the registry can't be reached.
    await Bun.write(`${docker.env.FAKE_DOCKER_DIR}/manifest-unavailable`, "");
    const before = (await docker.commands()).length;

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`\nImages\n  ${PRERUN}  ready\n`);
    const commands = (await docker.commands()).slice(before);
    expect(commands.filter((command) => command === `docker manifest inspect ${PRERUN}`)).toHaveLength(1);
    expect(commands).toContain(`${REMOTE} push --quiet ${PRERUN}`);
    expect(commands.some((command) => / build /.test(command))).toBe(false);
  });

  /** A copy of 0211 whose example test case has 3 iterations, its runtime `concurrency`, and, if `slow`, an agent that takes a second. */
  async function copyWith(concurrency: number, slow = false) {
    const copy = await copyScenarioProject("0211");
    const thunderjarDir = `${copy.dir}/.thunderjar`;
    const harness = `${thunderjarDir}/parameters/harnessModels/fake-harness-alpha/index.ts`;
    if (slow) await Bun.write(harness, (await Bun.file(harness).text()).replace("`printf", "`sleep 1 && printf"));
    const testCase = `${thunderjarDir}/test-cases/example.ts`;
    await Bun.write(testCase, (await Bun.file(testCase).text()).replace("iterations: 1", "iterations: 3"));
    const config = `${thunderjarDir}/thunderjar.config.ts`;
    await Bun.write(config, (await Bun.file(config).text()).replace('"--context", "cloud"]', `"--context", "cloud"], concurrency: ${concurrency}`));
    return copy;
  }

  test("with concurrency 2, runs two containers at once, and records every run", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWith(2, true);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toStartWith(header(3, 2));
    expect(timeless(stdout)).toContain(`\nRuns\n${completed("1.1")}${completed("1.2")}${completed("1.3")}\n3 runs: 3 completed\n`);
    const commands = await docker.commands();
    const started = (iteration: number) => at(commands, new RegExp(`^${REMOTE} run --name \\S+-1-${iteration} `));
    const firstDone = at(commands, new RegExp(`^${REMOTE} commit `));
    // The first two start before either is done; the third once one is.
    expect(started(1)).toBeGreaterThan(-1);
    expect(started(1)).toBeLessThan(firstDone);
    expect(started(2)).toBeGreaterThan(-1);
    expect(started(2)).toBeLessThan(firstDone);
    expect(started(3)).toBeGreaterThan(firstDone);
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns.map((run) => run.iteration).sort()).toEqual([1, 2, 3]);
    expect(containerRuns.every((run) => run.result !== undefined && Object.keys(run.result).length === 4)).toBe(true);
    for (const run of containerRuns) expect(commands).toContain(`${REMOTE} push --quiet ${REPOSITORY}:postrun-e${execution.executionId}-h${run.permutationHash.slice(0, 8)}-i0${run.iteration - 1}`);
  }, 30_000);

  test("--concurrency 1 overrides the runtime's, running them one after another as before", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWith(3);

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--concurrency", "1", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toStartWith(header(3, 1));
    expect(stdout).toContain("3 runs: 3 completed");
    // Each starts once the one before it is committed.
    const commands = await docker.commands();
    const started = (iteration: number) => at(commands, new RegExp(`^${REMOTE} run --name \\S+-1-${iteration} `));
    const committed = (iteration: number) => at(commands, new RegExp(`^${REMOTE} commit .* \\S+-1-${iteration}$`));
    expect(started(1)).toBeGreaterThan(-1);
    expect(committed(1)).toBeGreaterThan(started(1));
    expect(started(2)).toBeGreaterThan(committed(1));
    expect(committed(2)).toBeGreaterThan(started(2));
    expect(started(3)).toBeGreaterThan(committed(2));
  }, 30_000);

  test.each([["0"], ["two"], ["1.5"]])("--concurrency %p is a usage error", async (value) => {
    const { stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--concurrency", value]);

    expect(stderr).toContain("It must be a whole number, 1 or more.");
    expect(exitCode).not.toBe(0);
  });

  /**
   * A copy of 0211 with two prerun images, one per harness, alpha's then beta's, its runtime
   * `concurrency` and `build.concurrency`, and their image names.
   */
  async function copyWithTwoImages(concurrency: number, buildConcurrency: number) {
    const copy = await copyScenarioProject("0211");
    const thunderjarDir = `${copy.dir}/.thunderjar`;
    const harnesses = `${thunderjarDir}/parameters/harnessModels`;
    await $`cp -R ${harnesses}/fake-harness-alpha ${harnesses}/fake-harness-beta`.quiet();
    const beta = `${harnesses}/fake-harness-beta/index.ts`;
    await Bun.write(beta, (await Bun.file(beta).text()).replace("install fake-harness-alpha", "install fake-harness-beta"));
    const testCase = `${thunderjarDir}/test-cases/example.ts`;
    await Bun.write(
      testCase,
      (await Bun.file(testCase).text()).replace('"fake-harness-alpha/fake-model-small-001"]', '"fake-harness-alpha/fake-model-small-001", "fake-harness-beta/fake-model-small-001"]'),
    );
    const config = `${thunderjarDir}/thunderjar.config.ts`;
    await Bun.write(
      config,
      (await Bun.file(config).text())
        .replace('"--context", "cloud"]', `"--context", "cloud"], concurrency: ${concurrency}`)
        .replace("  runDataStore:", `  build: { concurrency: ${buildConcurrency} },\n  runDataStore:`),
    );
    const { stdout } = await thunderjar(copy.dir, ["run", "example", "--dry-run"]);
    const images = stdout.split("\n").flatMap((line) => /^Permutation \d+: prerun image (.*)$/.exec(line)?.[1] ?? []);
    expect(images).toHaveLength(2);
    return { copy, alpha: images[0] as string, beta: images[1] as string };
  }

  const stored = (image: string) => `${REPOSITORY}:prerun-h${image.split(":")[1]}`;
  const built = (commands: string[], image: string) => at(commands, new RegExp(`^${REMOTE} build .*-t ${image} `));
  const pushed = (commands: string[], image: string) => commands.indexOf(`${REMOTE} push --quiet ${stored(image)}`);

  test("with build concurrency 2, builds both prerun images at once", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(1, 2);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], slow: [alpha, beta] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`\nImages\n  ${stored(alpha)}  ready\n  ${stored(beta)}  ready\n`);
    expect(timeless(stdout)).toContain(`\nRuns\n${completed("1.1")}${completed("2.1", "fake-harness-beta/fake-model-small-001 ")}\n2 runs: 2 completed\n`);
    // Both builds start before either image is built, and so pushed.
    const commands = await docker.commands();
    const firstPushed = Math.min(pushed(commands, alpha), pushed(commands, beta));
    expect(firstPushed).toBeGreaterThan(-1);
    for (const image of [alpha, beta]) {
      expect(built(commands, image)).toBeGreaterThan(-1);
      expect(built(commands, image)).toBeLessThan(firstPushed);
    }
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns.map((run) => run.permutation).sort()).toEqual([1, 2]);
  }, 30_000);

  test("with build concurrency 1, builds one prerun image after another, and starts no run until every one is ready", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(2, 1);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], slow: [beta] });
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const commands = await docker.commands();
    expect(built(commands, alpha)).toBeGreaterThan(-1);
    expect(pushed(commands, alpha)).toBeLessThan(built(commands, beta));
    // Alpha's image is ready a second before beta's, and its run still waits for beta's.
    const firstRun = at(commands, new RegExp(`^${REMOTE} run `));
    expect(pushed(commands, beta)).toBeGreaterThan(built(commands, beta));
    expect(firstRun).toBeGreaterThan(pushed(commands, beta));
    expect((await readStore(data)).containerRuns).toHaveLength(2);
  }, 30_000);

  test("when a prerun image fails to build after another is ready, nothing runs and nothing is recorded", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(2, 1);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [beta] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stderr).toStartWith(`Error: Building ${beta} failed: ERROR: failed to build`);
    expect(stdout).toBe(`Execution <ULID>  example
  2 permutations, 2 runs, up to 2 at once, images stored in ${REPOSITORY}

Images
  ${stored(alpha)}  ready
  ${stored(beta)}  failed
`);
    const commands = await docker.commands();
    expect(pushed(commands, alpha)).toBeGreaterThan(-1);
    expect(commands.filter((command) => / (run|commit) /.test(command))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  }, 30_000);

  test("when the first prerun image fails to build, before any iteration starts, nothing is recorded", async () => {
    const { copy, alpha } = await copyWithTwoImages(2, 2);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [alpha] });
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stderr).toStartWith(`Error: Building ${alpha} failed`);
    expect((await docker.commands()).filter((command) => / (run|commit) /.test(command))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  }, 30_000);

  test("--iterations overrides the test case's, in what's run, written and recorded", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--iterations", "2", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toStartWith(header(2, 1).replace(/\n$/, ", overrides: --iterations 2\n"));
    expect(timeless(stdout)).toContain(`\nRuns\n${completed("1.1")}${completed("1.2")}\n2 runs: 2 completed\n`);
    const { execution, containerRuns } = await readStore(data);
    expect(execution.matrix.iterations).toBe(2);
    expect(containerRuns.map((run) => run.iteration).sort()).toEqual([1, 2]);
  }, 30_000);

  test("--iterations overrides the test case's in the dry run", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--dry-run", "--iterations", "3"]);

    expect(exitCode).toBe(0);
    expect(stdout.match(/^ {2}Iteration \d+:/gm)).toEqual(["  Iteration 1:", "  Iteration 2:", "  Iteration 3:"]);
  });

  test.each([["0"], ["two"], ["1.5"]])("--iterations %p is a usage error", async (value) => {
    const { stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--iterations", value]);

    expect(stderr).toContain("It must be a whole number, 1 or more.");
    expect(exitCode).not.toBe(0);
  });

  /**
   * A copy of 0211 with 2 iterations and concurrency 2, whose runtime's hooks run `before` and
   * `after` with `sh -c`, given by their deprecated old names if `oldNames`, and where they write to.
   */
  async function copyWithHooks(before: string, after: string, oldNames = false) {
    const copy = await copyWith(2);
    const log = `${copy.dir}/hooks.log`;
    const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    const hook = (script: string) => JSON.stringify(["sh", "-c", script.replaceAll("$LOG", log)]);
    await Bun.write(
      config,
      (await Bun.file(config).text())
        .replace("iterations: 3", "iterations: 2")
        .replace("concurrency: 2", `concurrency: 2, ${oldNames ? "beforeRun" : "beforeExecution"}: ${hook(before)}, ${oldNames ? "afterRun" : "afterExecution"}: ${hook(after)}`),
    );
    const testCase = `${copy.dir}/.thunderjar/test-cases/example.ts`;
    await Bun.write(testCase, (await Bun.file(testCase).text()).replace("iterations: 3", "iterations: 2"));
    return Object.assign(copy, { log });
  }

  const LOGS = 'echo "$0 $THUNDERJAR_EXECUTION_ID $THUNDERJAR_CONCURRENCY $THUNDERJAR_CONTAINERS" >> $LOG';
  /** Keeps the commands the fake Docker has been given so far, in `$LOG.$0`. */
  const KEEPS_COMMANDS = 'cat "$FAKE_DOCKER_DIR/commands" > $LOG.$0';

  test("interrupted, it removes its containers from the runtime, killing their agents, runs afterExecution, and exits 143", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks(`${LOGS.replace("$0", "before")}`, `${LOGS.replace("$0", "after")}`);
    // An agent that says it started, with its process ID, then would run for a minute.
    const harness = `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`;
    // Outside the project: the fake Docker maps any path with /thunderjar or /workspace in it into the container.
    const marks = `/tmp/tj-interrupt-${crypto.randomUUID()}`;
    await $`mkdir -p ${marks}`.quiet();
    await using _marks = { [Symbol.asyncDispose]: async () => void (await $`rm -rf ${marks}`.quiet()) };
    await Bun.write(harness, (await Bun.file(harness).text()).replace("`printf", () => `\`echo $$ > ${marks}/started-$$ && sleep 60 && printf`));
    const data = dataDir();
    const cli = Bun.spawn(["bun", `${REPO_ROOT}/src/cli/index.ts`, "run", "example", "--data-dir", data, "--log-level", "silent"], {
      cwd: copy.dir,
      // No warm-up, or the second iteration would start 5 seconds after the first.
      env: { ...Bun.env, TMPDIR: TMP_DIR, THUNDERJAR_CACHE_WARMUP_MS: "0", ...docker.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    // Both iterations' containers are running their agents.
    const started = () => [...new Bun.Glob("started-*").scanSync({ cwd: marks })];
    while (started().length < 2) await Bun.sleep(50);
    const agents = await Promise.all(started().map(async (file) => (await Bun.file(`${marks}/${file}`).text()).trim()));

    cli.kill("SIGTERM");
    const [exitCode, stderr] = await Promise.all([cli.exited, new Response(cli.stderr).text()]);

    expect(exitCode).toBe(143);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect(stderr).toBe(`Interrupted (SIGTERM): stopping execution ${executionId}'s containers.\n`);
    // One command removes both, in the order Docker listed them.
    const removal = (await docker.commands()).find((command) => command.startsWith(`${REMOTE} rm --force `) && command.split(" ").length === 7);
    expect(removal?.split(" ").slice(5).toSorted()).toEqual([`thunderjar-run-${executionId}-1-1`, `thunderjar-run-${executionId}-1-2`]);
    expect(await Bun.file(copy.log).text()).toBe(`before ${executionId} 2 2\nafter ${executionId} 2 2\n`);
    // Its agents were killed, not left running.
    // Gone, or a zombie nobody has reaped yet: `ps` prints its state, or nothing.
    for (const pid of agents) expect((await $`ps -o stat= -p ${pid}`.quiet().nothrow().text()).trim()).toMatch(/^(Z.*)?$/);
    expect((await readStore(data)).execution.status).toBe("failed");
  }, 30_000);

  test("beforeExecution runs before anything runs on the runtime, and afterExecution once it's done, each told about the execution", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const hook = (name: string) => `${KEEPS_COMMANDS.replace("$0", name)}; ${LOGS.replace("$0", name)}`;
    await using copy = await copyWithHooks(hook("before"), hook("after"));
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // The hooks write nothing to the frame.
    expect(timeless(stdout)).toBe(`${header(2, 2)}
Images
  ${PRERUN}  ready

Runs
${completed("1.1")}${completed("1.2")}
2 runs: 2 completed
Recorded in <REPO>/fixtures/.tmp/data-<UUID>/runs.sqlite
`);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect(await Bun.file(copy.log).text()).toBe(`before ${executionId} 2 2\nafter ${executionId} 2 2\n`);
    const seenBy = async (name: string) => (await Bun.file(`${copy.log}.${name}`).text()).split("\n").filter(Boolean);
    // Before it, the runtime has been asked nothing.
    expect((await seenBy("before")).filter((command) => command.startsWith(REMOTE))).toEqual([]);
    // After it, nothing more: both runs are committed, pushed and removed by then.
    const commands = await docker.commands();
    expect(await seenBy("after")).toEqual(commands);
    for (const iteration of [1, 2]) {
      expect(commands).toContain(`${REMOTE} push --quiet ${REPOSITORY}:postrun-e${executionId}-h0af800ad-i0${iteration - 1}`);
      expect(commands).toContain(`${REMOTE} rm --force thunderjar-run-${executionId}-1-${iteration}`);
    }
  }, 30_000);

  test("beforeRun and afterRun, the hooks' deprecated old names, still run, each with a warning naming its new name", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks(LOGS.replace("$0", "before"), LOGS.replace("$0", "after"), true);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stderr).toBe(
      "Warning: thunderjar.config.ts: runtime.beforeRun is deprecated, rename it beforeExecution. It runs once per execution, not once per run.\n" +
        "Warning: thunderjar.config.ts: runtime.afterRun is deprecated, rename it afterExecution. It runs once per execution, not once per run.\n",
    );
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect(await Bun.file(copy.log).text()).toBe(`before ${executionId} 2 2\nafter ${executionId} 2 2\n`);
    expect(stdout).toContain("2 runs: 2 completed");
  }, 30_000);

  test("a beforeExecution that fails is an error, and nothing else runs, afterExecution included", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks("echo starting; echo no machine to start >&2; exit 3", LOGS.replace("$0", "after"));
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(header(2, 2));
    expect(stderr).toBe("Error: The runtime's beforeExecution failed: no machine to start\n");
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => / (build|push|pull|run) /.test(command))).toEqual([]);
    expect(await Bun.file(copy.log).exists()).toBe(false);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("afterExecution runs after an execution that failed, and an afterExecution that fails is an error", async () => {
    // The image store has it, and the runtime doesn't, so it's pulled.
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], stored: [PRERUN], pullDenied: true });
    await using copy = await copyWithHooks(LOGS.replace("$0", "before"), `${LOGS.replace("$0", "after")}; exit 1`);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(await Bun.file(copy.log).text()).toMatch(/^before .*\nafter .*\n$/);
    expect(stdout).toBe(`${header(2, 2)}\nImages\n  ${PRERUN}  failed\n`);
    expect(stderr).toStartWith("Error: The runtime couldn't pull ");
    expect(stderr).toEndWith(`Error: The runtime's afterExecution failed: \`sh -c ${LOGS.replace("$0", "after").replace("$LOG", "<PROJECT>/hooks.log")}; exit 1\` exited 1\n`);
  });

  test("an afterExecution that fails after an execution that completed is an error, after the frame", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks(LOGS.replace("$0", "before"), `${LOGS.replace("$0", "after")}; echo no machine to stop >&2; exit 1`);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toContain("2 runs: 2 completed");
    expect(stderr).toBe("Error: The runtime's afterExecution failed: no machine to stop\n");
    expect(exitCode).toBe(1);
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns).toHaveLength(2);
  }, 30_000);

  test("a pull the runtime can't make is an error saying what to check, and nothing is run or written", async () => {
    // The image store has it, and the runtime doesn't, so it's pulled.
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], stored: [PRERUN], pullDenied: true });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`${header(1, 1)}\nImages\n  ${PRERUN}  failed\n`);
    expect(stderr).toBe(`Error: The runtime couldn't pull ${PRERUN}: Error response from daemon: pull access denied for ${PRERUN}, repository does not exist or may require 'docker login'
Make sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this.
`);
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => / run /.test(command))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});
