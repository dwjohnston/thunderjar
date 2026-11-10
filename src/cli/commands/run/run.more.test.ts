// More of `thunderjar run`, through the CLI: see run.test.ts. Split from it so that
// `bun test --parallel` runs the two in separate workers.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";
import { KEY, dataDir, permutation, readStore, removeDataDirs } from "./runTestSupport.ts";

afterEach(removeDataDirs);

describe("0202 typical project, without the key fake-harness-alpha needs", () => {
  const MISSING = "Error: fake-harness-alpha needs FAKE_HARNESS_KEY, which is not set.\nExport it in the shell that runs thunderjar.\n";

  test("run stops before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(MISSING);
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("so does the dry run", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(MISSING);
    expect(exitCode).toBe(1);
  });

  test("a test case of harnesses that need nothing runs without it", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-cases/beta-only.ts`,
      `import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-beta/fake-model-large-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`,
    );

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "beta-only", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("env:");
  });
});

describe("0204 misbehaving agents", () => {
  test("an agent that times out is killed, and one that exits non-zero or leaves no result file is marked, each measured all the same", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(`
 1/3  iteration 1/1  fake-sleeper | plain  ... timed out after <duration>
      isPrimeTsExists: false
 2/3  iteration 1/1  fake-crasher | plain  ... exited 1 (<duration>)
      isPrimeTsExists: false
 3/3  iteration 1/1  fake-silent | plain  ... done, no result file (<duration>)
      isPrimeTsExists: true
Wrote <DATA>/runs/<ULID>/
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    const [sleeper, crasher, silent] = store.containerRuns as [ContainerRunRecord, ContainerRunRecord, ContainerRunRecord];
    expect(sleeper.execution).toMatchObject({ exitCode: null, timedOut: true, timeoutSeconds: 2 });
    // Killed at its timeout, not left to sleep out its 300s.
    expect(sleeper.execution.finishedAt - sleeper.execution.startedAt).toBeLessThan(10_000);
    expect(sleeper.harnessResult).toBeNull();
    expect(crasher.execution).toMatchObject({ exitCode: 1, timedOut: false });
    expect(crasher.harnessResult).toBe('{"error":"crashed"}\n');
    expect(silent.execution).toMatchObject({ exitCode: 0, timedOut: false });
    expect(silent.harnessResult).toBeNull();
    // Each was committed, and removed.
    expect(await docker.images()).toContain(`thunderjar-postrun:${store.execution.executionId}-1-1`);
    expect(await docker.containers()).toEqual([]);
  }, 30_000);
});

describe("0206 run options", () => {
  const OPTIONS = "--security-opt seccomp=unconfined --security-opt apparmor=unconfined";

  test("--dry-run: a base image's run options are printed with each container run they're given to", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "0d345b7c", 1)}

Permutation 2: prerun image thunderjar-prerun:0d345b7c
  Iteration 1: postrun image thunderjar-postrun:<ULID>-2-1
    docker:   ${OPTIONS}
    command:  sh /thunderjar/thunderjar-run.sh
`);
  });

  test("they're added to the docker run of that base image's agent containers only", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const runs = (await docker.commands()).filter((command) => command.startsWith("docker run --name"));
    expect(runs.map((command) => command.includes(OPTIONS))).toEqual([false, true]);
    expect(runs[1]).toContain(` --pull never ${OPTIONS} --entrypoint sh thunderjar-prerun:0d345b7c -c `);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "77e9dd16", 1)}
`);
  });
});

describe("0402 broken declarations", () => {
  test("a broken measurement stops the run before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0402"), ["run", "unknown-instrument", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
    });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: .thunderjar/parameters/tasks/unknown-instrument/measurements/isPrimeTsExists.ts: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest, replyMatches, shell\n',
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("0209 floating code state", () => {
  test("each container run records what its parameters resolved to, and show displays it", async () => {
    const MAIN = "24dc11c26e2716a12cf33b82fec895a7f02b3e8a";
    await using docker = await fakeDocker();
    await using git = await fakeCommand("git", { stdout: `${MAIN}\trefs/heads/main` });
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(scenario("0209"), ["run", "follow-main", "--data-dir", data], { env: { ...docker.env, ...git.env } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await git.calls()).toHaveLength(1);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.parameters.codeState).toEqual({ name: "follow-main", parameterHash: expect.stringMatching(/^[0-9a-f]{64}$/), resolved: MAIN });
    expect(record.parameters.promptSet).toEqual({ name: "snerk", parameterHash: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const show = await thunderjar(scenario("0209"), ["show", record.executionId, "1-1", "--data-dir", data]);
    expect(show.stdout).toContain(`\n  codeState      follow-main                              ${record.parameters.codeState.parameterHash.slice(0, 8)}  resolved ${MAIN}\n`);
  });
});

describe("0210 build secrets", () => {
  test("a secret's value is in no record of the run", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();
    const token = `ghp_${crypto.randomUUID()}`;

    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["run", "example", "--data-dir", data], { env: { ...docker.env, GITHUB_TOKEN: token } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect((await readStore(data)).containerRuns).toHaveLength(1);
    expect((await $`grep -r ${token} ${data}`.nothrow().quiet()).exitCode).toBe(1);
    expect((await docker.commands()).find((command) => command.startsWith("docker build"))).toContain(" --secret id=github,env=GITHUB_TOKEN --ssh default ");
  });

  test("without the secret's variable, it stops before anything is built or run", async () => {
    await using docker = await fakeDocker();

    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["run", "example", "--data-dir", dataDir()], { env: { ...docker.env, GITHUB_TOKEN: "" } });

    expect(stderr).toBe('Error: Build secret "github" needs GITHUB_TOKEN, which is not set.\nExport it in the shell that runs thunderjar.\n');
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("0207 image store", () => {
  const REPOSITORY = "ghcr.io/acme/thunderjar-images";
  const PRERUN = `${REPOSITORY}:prerun-h77e9dd16`;

  test("without a docker login for the registry, stops before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      `Error: Can't push to ${REPOSITORY}: no valid Docker login for ghcr.io (Cannot perform an interactive login from a non TTY device). Run \`docker login ghcr.io\`.\n`,
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual(["docker login ghcr.io"]);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("pushes the prerun image once built, and the postrun image before it's measured", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-h0af800ad-i00`;
    expect(stdout.replace(executionId, "<ID>")).toBe(`Execution <ULID>
Building thunderjar-prerun:77e9dd16 ... done
Pushing ${PRERUN} ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
Wrote <REPO>/fixtures/.tmp/data-<UUID>/runs/<ULID>/
`);
    expect(await docker.pushed()).toEqual([PRERUN, postrun]);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker login ghcr.io");
    // Pushed before the first measurement container starts.
    expect(commands.indexOf(`docker push --quiet ${postrun}`)).toBeLessThan(commands.findIndex((command) => command.includes("-measure-")));
  });

  test("a prerun push the registry refuses is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:77e9dd16"], failing: [PRERUN] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`Execution <ULID>\nPushing ${PRERUN} ... failed\n`);
    expect(stderr).toBe(`Error: Pushing ${PRERUN} failed: denied: permission_denied: The token provided does not match expected scopes.
Check that your Docker login for ghcr.io can push to ${REPOSITORY}: on ghcr.io, a token needs the write:packages scope.
`);
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("0201 minimal existing setup, with imageStore: null", () => {
  test("asks Docker for no login, and pushes nothing", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun");
    expect(commands.filter((command) => /^docker (login|tag|push)\b/.test(command))).toEqual([]);
  });
});
