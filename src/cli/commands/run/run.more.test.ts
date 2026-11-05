// More of `thunderjar run`, through the CLI: see run.test.ts. Split from it so that
// `bun test --parallel` runs the two in separate workers.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { Reply } from "../../../api/declarations.ts";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";
import { ALPHA_0201, KEY, PLAIN, dataDir, permutation, readStore, removeDataDirs } from "./runTestSupport.ts";

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
Recorded in <DATA>/runs.sqlite
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

describe("0205 multi-turn", () => {
  const RUN_TURN_1 = (session: string) =>
    `mkdir -p "$HOME/.fake-rememberer" && cp /thunderjar/turns/1/prompt.txt "$HOME/.fake-rememberer/${session}" && printf '{"reply":"I will remember that: %s"}' "$(cat /thunderjar/turns/1/prompt.txt)" > /thunderjar/turns/1/result.json`;
  const RUN_TURN_2 = (session: string) =>
    `printf '{"reply":"You told me: %s"}' "$(cat "$HOME/.fake-rememberer/${session}")" > /thunderjar/turns/2/result.json`;

  test("--dry-run: the iteration's session, then each turn's prompt and command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0205"), ["run", "remember", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:b3d358e4
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    session:  <UUID>
    prompt 1: My rubber ducky is called Eli.
    turn 1:   ${RUN_TURN_1("<UUID>")}
    prompt 2: What is my rubber ducky called?
    turn 2:   ${RUN_TURN_2("<UUID>")}
`);
  });

  test("each turn runs in the same container and session, and each reply is recorded and measured", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0205"), ["run", "remember", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(`
 1/1  iteration 1/1  fake-rememberer | tell-then-ask  ... done (<duration>)
      promisedToRemember: true   remembersName: true
Recorded in <DATA>/runs.sqlite
`);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.execution.turns?.map((turn) => turn.exitCode)).toEqual([0, 0]);
    expect(record.turns?.map((turn) => turn.reply)).toEqual([
      { outcome: "collected", text: "I will remember that: My rubber ducky is called Eli." },
      { outcome: "collected", text: "You told me: My rubber ducky is called Eli." },
    ]);
    // The record's reply and result file are the last turn's.
    expect(record.reply).toEqual(record.turns?.[1]?.reply as Reply);
    expect(record.harnessResult).toBe(record.turns?.[1]?.harnessResult as string);
    // Both turns used the session ID the record names. (The fake Docker's HOME is the container's root.)
    expect(await docker.fileIn(record.postrunImage, `/.fake-rememberer/${record.sessionId}`)).toBe("My rubber ducky is called Eli.");

    // show gives each turn's reply.
    const shown = await thunderjar(scenario("0205"), ["show", record.executionId, "1-1", "--data-dir", data]);
    expect(shown.stdout).toContain(`
Exit         0
Turns        2 of 2 ran
Result file  55 bytes

Reply
  Turn 1:  I will remember that: My rubber ducky is called Eli.
  Turn 2:  You told me: My rubber ducky is called Eli.
`);
  });

  test("a turn that exits non-zero stops the turns after it", async () => {
    await using copy = await copyScenarioProject("0205");
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-rememberer/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => (ctx.turn === 0 ? "exit 2" : \`echo '{"reply":"Eli"}' > \${ctx.resultPath}\`),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "remember", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stdout).toContain(" ... exited 2, no result file (<duration>)\n");
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.execution.exitCode).toBe(2);
    expect(record.execution.turns?.map((turn) => turn.exitCode)).toEqual([2]);
    expect(record.turns?.map((turn) => turn.harnessResult)).toEqual([null, null]);
    expect(record.result.remembersName?.outcome).toEqual({ outcome: "skipped", reason: "no reply: the agent left no result file" });
  });
});

describe("0206 run options", () => {
  const SANDBOXER = `if unshare --user --map-root-user --mount --pid --fork true; then reply=sandboxed; else reply="no sandbox"; fi && echo "{\\"reply\\":\\"$reply\\"}" > /thunderjar/result.json`;
  const OPTIONS = "--security-opt seccomp=unconfined --security-opt apparmor=unconfined";

  test("--dry-run: a base image's run options are printed with each container run they're given to", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "b3d358e4", 1, "Sandbox yourself.", SANDBOXER)}

Permutation 2: prerun image thunderjar-prerun:b3d358e4
  Iteration 1: postrun image thunderjar-postrun:<ULID>-2-1
    docker:   ${OPTIONS}
    prompt:   Sandbox yourself.
    command:  ${SANDBOXER}
`);
  });

  test("they're added to the docker run of that base image's agent containers only", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const runs = (await docker.commands()).filter((command) => command.startsWith("docker run --name"));
    expect(runs.map((command) => command.includes(OPTIONS))).toEqual([false, true]);
    expect(runs[1]).toContain(` --pull never ${OPTIONS} --entrypoint sh thunderjar-prerun:b3d358e4 -c `);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "ae60c784", 1, PLAIN, ALPHA_0201(PLAIN))}
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
  const PRERUN = `${REPOSITORY}:prerun-hae60c784`;

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
    const postrun = `${REPOSITORY}:postrun-e${executionId}-hb7b0c69c-i00`;
    expect(stdout.replace(executionId, "<ID>")).toBe(`Execution <ULID>
Building thunderjar-prerun:ae60c784 ... done
Pushing ${PRERUN} ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
Recorded in <REPO>/fixtures/.tmp/data-<UUID>/runs.sqlite
`);
    expect(await docker.pushed()).toEqual([PRERUN, postrun]);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker login ghcr.io");
    // Pushed before the first measurement container starts.
    expect(commands.indexOf(`docker push --quiet ${postrun}`)).toBeLessThan(commands.findIndex((command) => command.includes("-measure-")));
  });

  test("a prerun push the registry refuses is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:ae60c784"], failing: [PRERUN] });
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

describe("0211 remote runtime", () => {
  const REPOSITORY = "ghcr.io/acme/thunderjar-images";
  const PRERUN = `${REPOSITORY}:prerun-hae60c784`;
  const REMOTE = "docker --context cloud";

  test("builds and pushes locally, pulls into the runtime, then runs, commits, pushes and measures there", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-hb7b0c69c-i00`;
    expect(stdout.replace(executionId, "<ID>")).toBe(`Execution <ULID>
Running containers with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Building thunderjar-prerun:ae60c784 ... done
Pushing ${PRERUN} ... done
Pulling ${PRERUN} into the runtime ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
Recorded in <REPO>/fixtures/.tmp/data-<UUID>/runs.sqlite
`);
    const commands = await docker.commands();
    const local = commands.filter((command) => !command.startsWith(REMOTE));
    expect(local).toEqual([
      "docker login ghcr.io",
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      expect.stringMatching(/^docker build -t thunderjar-prerun:ae60c784 /),
      `docker tag thunderjar-prerun:ae60c784 ${PRERUN}`,
      `docker push --quiet ${PRERUN}`,
    ]);
    expect(commands).toContain(`${REMOTE} pull --quiet ${PRERUN}`);
    // The runtime runs the stored prerun image, pulling it if it must.
    expect(commands.find((command) => command.startsWith(`${REMOTE} run --name`))).toContain(`--pull missing`);
    expect(commands.find((command) => command.startsWith(`${REMOTE} run --name`))).toContain(` ${PRERUN} -c `);
    expect(commands).toContain(`${REMOTE} push --quiet ${postrun}`);
    expect(commands.some((command) => command.startsWith(`${REMOTE} run --detach`))).toBe(true);
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

  test("a pull the runtime can't make is an error saying what to check, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:ae60c784"], pullDenied: true });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`Execution <ULID>
Running containers with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Pushing ${PRERUN} ... done
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
