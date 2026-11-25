// More of `thunderjar run`, through the CLI: see run.test.ts. Split from it so that
// `bun test --parallel` runs the two in separate workers.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar, TMP_DIR } from "../../../testing/cli.ts";
import { instruments } from "../../../instruments/instruments.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { FAKE_DOCKER, fakeDocker } from "../../../testing/fakeDocker.ts";
import { REPO_ROOT, scenario } from "../../../testing/scenario.ts";
import { KEY, TEST_CASE_SECRET, dataDir, permutation, readStore, removeDataDirs } from "./runTestSupport.ts";

const KNOWN_INSTRUMENTS = Object.keys(instruments).join(", ");

afterEach(removeDataDirs);

describe("0211 remote runtime", () => {
  const REPOSITORY = "ghcr.io/acme/thunderjar-images";
  const PRERUN = `${REPOSITORY}:prerun-h4799f255`;
  const REMOTE = "docker --context cloud";

  test("builds on the runtime and pushes from there, so pulls nothing, then runs, commits, pushes and measures there", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-h0af800ad-i00`;
    expect(stdout.replace(executionId, "<ID>")).toBe(`Execution <ULID>
Running containers with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Building thunderjar-prerun:4799f255 ... done
Pushing ${PRERUN} ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   tsIgnoreCount: 1
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
    // Its disk usage is logged before and after.
    expect(commands.filter((command) => command.startsWith(`${REMOTE} system df`))).toHaveLength(2);
    expect(await docker.images()).toEqual(["thunderjar-prerun:4799f255", PRERUN, `thunderjar-postrun:${executionId}-1-1`, postrun]);
  });

  test("--timings prints how long each phase took, once the execution and the runtime's afterExecution are done", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--timings", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    const from = lines.indexOf("Timings: <duration> in all");
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
    expect(stdout).not.toContain("Building");
    expect(stdout).toContain(`Pulling ${PRERUN} into the runtime ... done`);
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
    expect(stdout).not.toMatch(/Building|Pushing ghcr.io\/acme\/thunderjar-images:prerun|Pulling|pushing prerun images|pulling prerun images/);
    const commands = (await docker.commands()).slice(before);
    // The runtime's images are listed once each, for all of them: those it builds, and those it has from the image store.
    expect(commands.filter((command) => command.startsWith(`${REMOTE} image ls`)).sort()).toEqual([
      `${REMOTE} image ls --format {{.Repository}}:{{.Tag}} ${REPOSITORY}`,
      `${REMOTE} image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun`,
    ]);
    expect(commands.filter((command) => /^docker( --context cloud)? (build|tag \S+ \S+:prerun|push --quiet \S+:prerun|pull|info)\b/.test(command))).toEqual([]);
    expect(log).toContain("prerun image already in the image store: not built or pushed");
    expect(log).toContain("prerun image already in the runtime: not pulled");
  });

  test("a prerun image is pushed if the image store can't say whether it has it", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });
    // Every `manifest inspect` now fails, as if the registry can't be reached.
    await Bun.write(`${docker.env.FAKE_DOCKER_DIR}/manifest-unavailable`, "");
    const before = (await docker.commands()).length;

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Pushing ${PRERUN} ... done`);
    const commands = (await docker.commands()).slice(before);
    expect(commands.filter((command) => command === `docker manifest inspect ${PRERUN}`)).toHaveLength(1);
    expect(commands).toContain(`${REMOTE} push --quiet ${PRERUN}`);
    expect(commands.some((command) => / build /.test(command))).toBe(false);
  });

  test("--local runs on the local Docker daemon, ignoring the runtime", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--local", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Running containers with");
    const commands = await docker.commands();
    expect(commands.filter((command) => command.startsWith(REMOTE))).toEqual([]);
    expect(commands.find((command) => command.startsWith("docker run --name"))).toContain("--pull never");
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

  test("with concurrency 2, runs two containers at once, writing each line whole, and records every run", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWith(2, true);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    expect(lines).toContain("Up to 2 containers at once");
    const at = (text: string) => lines.findIndex((line) => line.includes(text));
    const firstDone = at("  done (");
    // The first two start before either is done; the third once one is.
    expect(at("iteration 1/3  fake-harness-alpha | plain  started")).toBeLessThan(firstDone);
    expect(at("iteration 2/3  fake-harness-alpha | plain  started")).toBeLessThan(firstDone);
    expect(at("iteration 3/3  fake-harness-alpha | plain  started")).toBeGreaterThan(firstDone);
    for (const n of [1, 2, 3]) {
      const mine = lines.filter((line) => line.startsWith(` 1/1  iteration ${n}/3  fake-harness-alpha | plain  `));
      expect(mine.slice(0, 2)).toEqual([` 1/1  iteration ${n}/3  fake-harness-alpha | plain  started`, expect.stringMatching(/  done \(.*\)$/)]);
      // Its postrun image is pushed while it's measured, so these two come in either order.
      expect(mine.slice(2).toSorted()).toEqual([
        ` 1/1  iteration ${n}/3  fake-harness-alpha | plain  isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   tsIgnoreCount: 1`,
        expect.stringMatching(/  pushed ghcr\.io\/acme\/thunderjar-images:postrun-/),
      ]);
    }
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns.map((run) => run.iteration).sort()).toEqual([1, 2, 3]);
    expect(containerRuns.every((run) => run.result !== undefined && Object.keys(run.result).length === 4)).toBe(true);
  }, 30_000);

  test("--concurrency 1 overrides the runtime's, running them one after another as before", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWith(3);

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--concurrency", "1", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("containers at once");
    expect(stdout).toContain(" 1/1  iteration 1/3  fake-harness-alpha | plain  ... done (");
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

  test("with build concurrency 2, builds both prerun images at once, writing each line whole", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(1, 2);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], slow: [alpha, beta] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    expect(lines).toContain("Building up to 2 prerun images at once");
    expect(stdout).not.toContain("containers at once");
    const at = (text: string) => lines.indexOf(text);
    const firstBuilt = Math.min(at(`Built ${alpha}`), at(`Built ${beta}`));
    expect(at(`Building ${alpha}`)).toBeLessThan(firstBuilt);
    expect(at(`Building ${beta}`)).toBeLessThan(firstBuilt);
    expect(lines).toContain(`Pushed ghcr.io/acme/thunderjar-images:prerun-h${alpha.split(":")[1]}`);
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns.map((run) => run.permutation).sort()).toEqual([1, 2]);
  }, 30_000);

  test("with concurrency 2, starts an iteration once its own prerun image is ready, while the next is still building", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(2, 1);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], slow: [beta] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    const at = (text: string) => lines.findIndex((line) => line.includes(text));
    expect(at(`Built ${alpha}`)).toBeLessThan(at(`Building ${beta}`));
    expect(at("fake-harness-alpha | plain  started")).toBeLessThan(at(`Built ${beta}`));
    expect(at(`Built ${beta}`)).toBeLessThan(at("fake-harness-beta | plain  started"));
    expect((await readStore(data)).containerRuns).toHaveLength(2);
  }, 30_000);

  test("when a prerun image fails to build after an iteration has started, it finishes and is recorded, and the execution is failed", async () => {
    const { copy, alpha, beta } = await copyWithTwoImages(2, 1);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [beta] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Building ${beta} failed: ERROR: failed to build`);
    expect(stdout).toContain(`Built ${alpha}`);
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("failed");
    expect(containerRuns.map((run) => run.permutation)).toEqual([1]);
    expect(Object.keys(containerRuns[0]?.result ?? {})).toHaveLength(4);
  }, 30_000);

  test("when the first prerun image fails to build, before any iteration starts, nothing is recorded", async () => {
    const { copy, alpha } = await copyWithTwoImages(2, 2);
    await using _copy = copy;
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [alpha] });
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`Building ${alpha} failed`);
    expect(await Bun.file(data).exists()).toBe(false);
  }, 30_000);

  test("--iterations overrides the test case's, in what's run, written and recorded", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--iterations", "2", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(" 1/1  iteration 2/2  fake-harness-alpha | plain  ... done (");
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
      env: { ...Bun.env, TMPDIR: TMP_DIR, ...docker.env },
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
    expect(stderr).toBe(`Error: Interrupted (SIGTERM): stopping execution ${executionId}'s containers on the runtime.\n`);
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
    await using copy = await copyWithHooks(`${LOGS.replace("$0", "before")}`, `${LOGS.replace("$0", "after")}`);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect(await Bun.file(copy.log).text()).toBe(`before ${executionId} 2 2\nafter ${executionId} 2 2\n`);
    const lines = stdout.split("\n");
    const before = lines.findIndex((line) => line.startsWith("Running the runtime's beforeExecution, `sh -c "));
    const after = lines.findIndex((line) => line.startsWith("Running the runtime's afterExecution, `sh -c "));
    expect(lines[before]).toEndWith("... done");
    expect(lines[after]).toEndWith("... done");
    expect(before).toBeLessThan(lines.findIndex((line) => line.includes("iteration 1/2")));
    expect(after).toBe(lines.findIndex((line) => line.startsWith("Recorded in ")) + 1);
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
    expect(stdout).toContain("Running the runtime's beforeExecution, `sh -c ");
  }, 30_000);

  test("a beforeExecution that fails is an error, and nothing else runs, afterExecution included", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks("echo starting; echo no machine to start >&2; exit 3", LOGS.replace("$0", "after"));
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toMatch(/Running the runtime's beforeExecution, `sh -c .*` \.\.\. failed\n$/);
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
    expect(stdout).toMatch(/Running the runtime's afterExecution, `sh -c .*` \.\.\. failed\n$/);
    expect(stderr).toStartWith("Error: The runtime couldn't pull ");
    expect(stderr).toEndWith(`Error: The runtime's afterExecution failed: \`sh -c ${LOGS.replace("$0", "after").replace("$LOG", "<PROJECT>/hooks.log")}; exit 1\` exited 1\n`);
  });

  test("--local runs neither hook", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks(LOGS.replace("$0", "before"), LOGS.replace("$0", "after"));

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--local", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Running the runtime's");
    expect(await Bun.file(copy.log).exists()).toBe(false);
  }, 30_000);

  test("a pull the runtime can't make is an error saying what to check, and nothing is run or written", async () => {
    // The image store has it, and the runtime doesn't, so it's pulled.
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], stored: [PRERUN], pullDenied: true });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`Execution <ULID>
Running containers with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Pulling ${PRERUN} into the runtime ... failed
`);
    expect(stderr).toBe(`Error: The runtime couldn't pull ${PRERUN}: Error response from daemon: pull access denied for ${PRERUN}, repository does not exist or may require 'docker login'
Make sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this; \`run --local\` runs on the local Docker daemon instead.
`);
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => / run /.test(command))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});
