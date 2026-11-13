/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// `thunderjar run` with a runtime's runner, and `thunderjar attach`, through the CLI: the fake
// Docker really runs the runner, from the build context of the runner image.
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { type ContainerRunRecord, type ExecutionRecord, sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar, TMP_DIR } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { REPO_ROOT } from "../../../testing/scenario.ts";

const REPOSITORY = "ghcr.io/acme/thunderjar-images";
const PRERUN = `${REPOSITORY}:prerun-h77e9dd16`;
const REMOTE = "docker --context cloud";
const MEASURES = `isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   tsIgnoreCount: 1`;

/**
 * A copy of 0211 whose runtime has a runner, given `runner` (the source of a RunnerConfig), and
 * `more` runtime fields. With `agent`, a shell command its fake agent runs first.
 */
async function copyWithRunner({ runner = "{}", more = "", agent }: { runner?: string; more?: string; agent?: string } = {}): Promise<ProjectCopy> {
  const copy = await copyScenarioProject("0211");
  const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
  await Bun.write(config, (await Bun.file(config).text()).replace('"--context", "cloud"]', `"--context", "cloud"], runner: ${runner}${more}`));
  if (agent !== undefined) {
    const harness = `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`;
    await Bun.write(harness, (await Bun.file(harness).text()).replace("`printf", () => `\`${agent} && printf`));
  }
  return copy;
}

/** The project's own store: where a runner's records are kept, with a SQLite run data store. */
async function readProjectStore(dir: string) {
  const store = sqliteStore(`${dir}/.thunderjar/.data/runs.sqlite`);
  const [execution] = await store.listExecutions();
  return { execution: execution as ExecutionRecord, containerRuns: execution ? await store.containerRunsOf(execution.executionId) : [] };
}

/** The commands given to the runtime's command, to the host's Docker, and by the runner to its own. */
async function commandsOf(docker: FakeDocker, runnerImage?: string) {
  const commands = await docker.commands();
  const submitted = commands.findIndex((command) => command.startsWith(`${REMOTE} run --detach`));
  return {
    runtime: commands.filter((command) => command.startsWith(REMOTE)),
    host: commands.slice(0, submitted === -1 ? undefined : submitted).filter((command) => !command.startsWith(REMOTE)),
    runner: submitted === -1 ? [] : commands.slice(submitted).filter((command) => !command.startsWith(REMOTE)),
    runnerImage: runnerImage ?? commands.find((command) => command.startsWith("docker build -t ") && command.includes(":runner-h"))?.split(" ")[3],
  };
}

describe("0211 remote runtime, with a runner", () => {
  test("builds and pushes the images here, then the runner runs, measures, pushes and records the execution, and run only follows it", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { execution, containerRuns } = await readProjectStore(copy.dir);
    const { executionId } = execution;
    const { runtime, host, runner, runnerImage } = await commandsOf(docker);
    expect(runnerImage).toMatch(/^ghcr\.io\/acme\/thunderjar-images:runner-h[0-9a-f]{8}$/);
    const postrun = `${REPOSITORY}:postrun-e${executionId}-h0af800ad-i00`;
    expect(stdout.replace(executionId, "<ID>").replaceAll(runnerImage as string, "<RUNNER>")).toBe(`Execution <ULID>
Running the execution on the runtime, in a runner started with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Building the runner image <RUNNER> ... done
Pushing <RUNNER> ... done
Building thunderjar-prerun:77e9dd16 ... done
Pushing ${PRERUN} ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      ${MEASURES}
Recorded in .thunderjar/.data/runs.sqlite
`);
    // Here: only the images are built and pushed.
    expect(host).toEqual([
      "docker login ghcr.io",
      `docker manifest inspect ${runnerImage}`,
      expect.stringMatching(/^docker build -t \S+:runner-h\w+ /),
      `docker tag ${runnerImage} ${runnerImage}`,
      `docker push --quiet ${runnerImage}`,
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      `docker manifest inspect ${PRERUN}`,
      expect.stringMatching(/^docker build -t thunderjar-prerun:77e9dd16 /),
      `docker tag thunderjar-prerun:77e9dd16 ${PRERUN}`,
      `docker push --quiet ${PRERUN}`,
    ]);
    // Through the runtime's command: the runner is started, sent its submission, followed, and removed.
    const container = `thunderjar-runner-${executionId}`;
    expect(runtime.map((command) => command.replace(/ cp (\S+) .*$/, " cp $1 <destination>"))).toEqual([
      `${REMOTE} run --detach --name ${container} --pull missing --init --tmpfs /run/thunderjar:mode=0700 -v /var/run/docker.sock:/var/run/docker.sock ${runnerImage}`,
      `${REMOTE} exec --interactive ${container} sh -c cat > /run/thunderjar/submission.json.part && mv /run/thunderjar/submission.json.part /run/thunderjar/submission.json`,
      `${REMOTE} logs --follow ${container}`,
      `${REMOTE} cp ${container}:/var/log/thunderjar-runner.log <destination>`,
      `${REMOTE} rm --force ${container}`,
    ]);
    // The runner, on its own Docker: everything else.
    // The fake's runtime shares the host's images, so it has the prerun image: not pulled.
    expect(runner).toContain(`docker image ls --format {{.Repository}}:{{.Tag}} ${REPOSITORY}`);
    expect(runner.find((command) => command.startsWith("docker run --name"))).toContain(` ${PRERUN} -c `);
    expect(runner.some((command) => command.startsWith("docker commit "))).toBe(true);
    expect(runner).toContain(`docker push --quiet ${postrun}`);
    expect(runner.some((command) => command.startsWith("docker run --rm --interactive"))).toBe(true);
    expect(runner.some((command) => command.includes(" image rm "))).toBe(false);
    expect(runner.some((command) => command.startsWith("docker build"))).toBe(false);
    // Recorded by the runner, and kept in the project's own file.
    expect(execution.status).toBe("complete");
    expect(containerRuns.map(({ permutation, iteration, result }) => [permutation, iteration, Object.keys(result)])).toEqual([
      [1, 1, ["isPrimeShape", "isPrimeTests", "isPrimeTsExists", "tsIgnoreCount"]],
    ]);
    expect(await docker.containers()).toEqual([]);
    // The runner's log is kept beside this command's.
    expect(await Bun.file(`${copy.dir}/.thunderjar/logs/${executionId}-runner.log`).text()).toContain("execution finished");
  });

  test("--json prints the execution and its container runs, as the runner recorded them, and --timings both sides' phases", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--json", "--timings"], { env: docker.env });

    expect(exitCode).toBe(0);
    const printed = JSON.parse(stdout) as { execution: ExecutionRecord; recordedIn: string; containerRuns: ContainerRunRecord[] };
    const stored = await readProjectStore(copy.dir);
    // The CLI's output has the execution's ID replaced.
    const withId = (text: string): unknown => JSON.parse(text.replaceAll("<ULID>", stored.execution.executionId));
    expect(withId(JSON.stringify(printed.execution))).toEqual(stored.execution);
    expect(withId(JSON.stringify(printed.containerRuns))).toEqual(stored.containerRuns);
    expect(printed.containerRuns).toHaveLength(1);
    expect(printed.recordedIn).toBe("<PROJECT>/.thunderjar/.data/runs.sqlite");
    const phases = stderr
      .slice(stderr.indexOf("Timings: "))
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split("  ")[0]);
    expect(phases).toEqual([
      "building prerun images",
      "pushing prerun images",
      "running agents",
      "reading what agents left",
      "committing postrun images",
      "pushing postrun images",
      "measuring",
      "",
    ]);
  });

  test("images already in the image store are neither built nor pushed", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner();
    await thunderjar(copy.dir, ["run", "example"], { env: docker.env });
    const before = (await docker.commands()).length;
    // As on other machines: neither the local daemon nor the runtime has the prerun image.
    const removed = Bun.file(`${docker.env.FAKE_DOCKER_DIR}/removed`);
    await Bun.write(removed, `${(await removed.exists()) ? await removed.text() : ""}thunderjar-prerun:77e9dd16\n${PRERUN}\n`);

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Building");
    expect(stdout).toContain(`Pulling ${PRERUN} into the runtime ... done`);
    const again = (await docker.commands()).slice(before);
    expect(again.filter((command) => /^docker (build|tag thunderjar-prerun)/.test(command))).toEqual([]);
    expect(again).toContain(`docker pull --quiet ${PRERUN}`);
  });

  test("the runner gets the variables it needs in its submission, and no others: a harness's key reaches its container, and the registry login is used", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner({
      runner: '{ registryLogin: { usernameEnv: "REG_USER", passwordEnv: "REG_TOKEN" } }',
      agent: "echo $FAKE_HARNESS_KEY-$NOT_SENT > key.txt",
    });
    const harness = `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`;
    await Bun.write(harness, (await Bun.file(harness).text()).replace('version: "1.0.0",', 'version: "1.0.0",\n  requiredEnv: ["FAKE_HARNESS_KEY"],'));
    const env = { ...docker.env, FAKE_HARNESS_KEY: "s3cret-key", REG_USER: "octocat", REG_TOKEN: "s3cret-token", NOT_SENT: "not-sent" };

    const { stderr, exitCode, log } = await thunderjar(copy.dir, ["run", "example", "--log-level", "debug"], { env, log: true });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { execution } = await readProjectStore(copy.dir);
    // The fake runs the runner with none of this process's variables: the key came in the submission.
    expect(await docker.fileIn(`thunderjar-postrun:${execution.executionId}-1-1`, "/workspace/key.txt")).toBe("s3cret-key-\n");
    const commands = await docker.commands();
    expect(commands).toContain("docker login ghcr.io --username octocat --password-stdin");
    // No value is on a command line, or in either log.
    const runnerLog = await Bun.file(`${copy.dir}/.thunderjar/logs/${execution.executionId}-runner.log`).text();
    for (const text of [commands.join("\n"), log as string, runnerLog]) {
      expect(text).not.toContain("s3cret-key");
      expect(text).not.toContain("s3cret-token");
    }
    expect(runnerLog).toContain("FAKE_HARNESS_KEY");
  });

  test("a container that never starts is its run's outcome on the runner too, timed by the start timeout set here", async () => {
    // The agent's container would take a minute to appear: the runner gives up on it after 3s.
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], slowStart: { "-1-1": 60 } });
    await using copy = await copyWithRunner();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: { ...docker.env, THUNDERJAR_START_TIMEOUT_SECONDS: "3" } });

    // No execution-level error: the run's own line says it failed to start, as when run here.
    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toContain(" 1/1  iteration 1/1  fake-harness-alpha | plain  ... failed to start\n");
    expect(stdout).toContain("  1×  failed to start  it didn't start within <duration>  (1-1)\n");
    const { execution, containerRuns } = await readProjectStore(copy.dir);
    expect(execution.status).toBe("failed");
    expect(containerRuns).toHaveLength(1);
    expect((containerRuns[0] as ContainerRunRecord).execution).toMatchObject({ exitCode: null, timedOut: false, failedToStart: "it didn't start within 3s" });
    const { runner } = await commandsOf(docker);
    expect(runner).toContain(`docker rm --force thunderjar-run-${execution.executionId}-1-1`);
    expect(runner.some((command) => command.startsWith("docker commit "))).toBe(false);
  }, 30_000);

  test("a variable the runner needs that's unset stops run before anything is built", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner({ runner: '{ env: ["EXTRA_ONE"], registryLogin: { usernameEnv: "REG_USER", passwordEnv: "REG_TOKEN" } }' });

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: { ...docker.env, REG_USER: "octocat" } });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: The runner on the runtime needs REG_TOKEN, EXTRA_ONE, which are not set.\nExport them in the shell that runs thunderjar.\n");
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => !command.startsWith("docker login"))).toEqual([]);
  });

  test("--data-dir is refused: the runner records the execution", async () => {
    await using copy = await copyWithRunner();

    const { stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", "elsewhere"]);

    expect(stderr).toBe(
      "Error: --data-dir can't be used with a runtime's runner: the runner records the execution, in the config's runDataStore. Pass --local to run here.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("--local runs here, as without a runner", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--local"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("runner");
    expect((await docker.commands()).filter((command) => command.startsWith(REMOTE) || command.includes("runner-"))).toEqual([]);
  });

  test("if the connection drops while it follows, it follows again, and writes each line once", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner({ agent: "sleep 1" });

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: { ...docker.env, FAKE_DOCKER_DROP_LOGS: "1" } });

    expect(exitCode).toBe(0);
    expect((await docker.commands()).filter((command) => command.startsWith(`${REMOTE} logs --follow`)).length).toBeGreaterThan(1);
    expect(stdout.split("\n").filter((line) => line.includes("iteration 1/1"))).toHaveLength(1);
    expect(stdout.split("\n").filter((line) => line.includes(" Pushing "))).toHaveLength(1);
    expect(stdout).toContain(MEASURES);
  }, 30_000);

  test("an error the runner stops on is reported as run would report its own", async () => {
    // In the image store already, so the runner must pull it, and can't.
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], pullDenied: true, stored: [PRERUN] });
    await using copy = await copyWithRunner();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`Pulling ${PRERUN} into the runtime ... failed`);
    expect(stderr).toStartWith(`Error: The runtime couldn't pull ${PRERUN}: Error response from daemon: pull access denied`);
    expect(await docker.containers()).toEqual([]);
  });
});

describe("0211 remote runtime, with a runner: detaching and attaching", () => {
  /** Starts `run example` in a copy whose agent waits for the file `release`, and resolves once its agent is running. */
  async function startSlowRun(docker: FakeDocker) {
    const marks = `/tmp/tj-attach-${crypto.randomUUID()}`;
    await $`mkdir -p ${marks}`.quiet();
    const copy = await copyWithRunner({ agent: `touch ${marks}/started && while [ ! -f ${marks}/release ]; do sleep 0.1; done` });
    const env = { ...Bun.env, TMPDIR: TMP_DIR, ...docker.env };
    const cli = Bun.spawn(["bun", `${REPO_ROOT}/src/cli/index.ts`, "--log-level", "silent", "run", "example"], { cwd: copy.dir, env, stdout: "pipe", stderr: "pipe" });
    while (!(await Bun.file(`${marks}/started`).exists())) await Bun.sleep(50);
    // Wait until run has written the iteration's line: it's following.
    await Bun.sleep(300);
    return {
      copy,
      cli,
      release: () => Bun.write(`${marks}/release`, ""),
      async [Symbol.asyncDispose]() {
        cli.kill("SIGKILL");
        await Bun.write(`${marks}/release`, "");
        await copy.remove();
        await $`rm -rf ${marks}`.quiet();
      },
    };
  }

  test("interrupted, run leaves the execution running, and says how to follow or stop it; attach follows it to its end", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using slow = await startSlowRun(docker);

    slow.cli.kill("SIGINT");
    const [exitCode, stderr, stdout] = await Promise.all([slow.cli.exited, new Response(slow.cli.stderr).text(), new Response(slow.cli.stdout).text()]);

    const executionId = /^Execution (\S+)/.exec(stdout)?.[1] as string;
    expect(exitCode).toBe(130);
    expect(stderr).toBe(
      `Error: Detached (SIGINT): execution ${executionId} carries on, on the runtime.\nFollow it again with \`thunderjar attach ${executionId}\`, or stop it with \`thunderjar attach ${executionId} --stop\`.\n`,
    );
    // Still running.
    expect(await docker.containers()).toEqual([`thunderjar-run-${executionId}-1-1`, `thunderjar-runner-${executionId}`]);

    await slow.release();
    const attached = await thunderjar(slow.copy.dir, ["attach", executionId], { env: docker.env });

    expect(attached.stderr).toBe("");
    expect(attached.exitCode).toBe(0);
    // The agent was changed to wait, so its images' hashes differ from 0211's.
    expect(attached.stdout.replaceAll(executionId, "<ID>").replace(/-h[0-9a-f]{8}/g, "-h<HASH>")).toBe(`Execution <ULID>
Following test case example, on the runtime
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${REPOSITORY}:postrun-e<ID>-h<HASH>-i00 ... done
      ${MEASURES}
Recorded in .thunderjar/.data/runs.sqlite
`);
    expect((await readProjectStore(slow.copy.dir)).execution).toMatchObject({ executionId, status: "complete" });
    expect(await docker.containers()).toEqual([]);
  }, 30_000);

  test("attach --stop stops the runner, which removes its containers and records the execution as failed", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using slow = await startSlowRun(docker);
    slow.cli.kill("SIGINT");
    const stdout = await new Response(slow.cli.stdout).text();
    await slow.cli.exited;
    const executionId = /^Execution (\S+)/.exec(stdout)?.[1] as string;
    const { runnerImage } = await commandsOf(docker);

    const stopped = await thunderjar(slow.copy.dir, ["attach", executionId, "--stop"], { env: docker.env });

    expect(stopped.stderr).toBe("");
    expect(stopped.stdout).toBe("Stopped execution <ULID>: removed 1 container from the runtime.\n");
    expect(stopped.exitCode).toBe(0);
    expect(await docker.containers()).toEqual([]);
    const commands = await docker.commands();
    expect(commands).toContain(`${REMOTE} stop --time 30 thunderjar-runner-${executionId}`);
    // The runner removed its agent's container itself, on its own Docker.
    expect(commands.some((command) => command.startsWith("docker rm --force") && command.includes(`thunderjar-run-${executionId}-1-1`))).toBe(true);
    // In the runner's own store: it was never followed to its end, so nothing was copied here.
    const runnerStore = sqliteStore(`${docker.contextOf(runnerImage as string)}/project/.thunderjar/.data/runs.sqlite`);
    expect(await runnerStore.listExecutions()).toMatchObject([{ executionId, status: "failed" }]);
  }, 30_000);

  test("if the runner dies without saying how the execution ended, run says so, and removes its container", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using slow = await startSlowRun(docker);
    const [runner] = (await docker.containers()).filter((name) => name.startsWith("thunderjar-runner-"));
    const executionId = (runner as string).slice("thunderjar-runner-".length);

    await $`kill -KILL ${(await Bun.file(`${docker.env.FAKE_DOCKER_DIR}/containers/${runner}/pid`).text()).trim()}`.quiet();
    const [exitCode, stderr] = await Promise.all([slow.cli.exited, new Response(slow.cli.stderr).text()]);

    expect(exitCode).toBe(1);
    expect(stderr).toBe(`Error: The runner of execution ${executionId} stopped (exit code 137) without saying how the execution ended.\n`);
    expect((await docker.containers()).filter((name) => name.startsWith("thunderjar-runner-"))).toEqual([]);
  }, 30_000);

  test("attach to an execution with no runner says so", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithRunner();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["attach", "01JNOSUCHEXECUTION"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: There's no runner for execution 01JNOSUCHEXECUTION on the runtime: no container thunderjar-runner-01JNOSUCHEXECUTION.\n");
    expect(exitCode).toBe(1);
  });

  test("attach without a runtime in the config is an error", async () => {
    await using copy = await copyScenarioProject("0207");

    const { stderr, exitCode } = await thunderjar(copy.dir, ["attach", "01JNOSUCHEXECUTION"]);

    expect(stderr).toBe("Error: attach follows an execution on a runtime, and thunderjar.config.ts gives none.\n");
    expect(exitCode).toBe(1);
  });
});
