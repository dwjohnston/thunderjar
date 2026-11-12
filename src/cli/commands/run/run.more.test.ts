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

    const { stdout, stderr, exitCode, log } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
      log: true,
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
3 of 3 agents didn't end cleanly:
  1×  timed out after <duration>  (1-1)
  1×  exited 1  fake-crasher: no space left on device  (2-1)
  1×  done, no result file  (3-1)
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
    // The log says why each failed: what the agent wrote to stderr, and its result file.
    expect(log).toContain(`WARN: execution: agent exited non-zero
    executionId: "<ULID>"
    permutation: 2
    iteration: 1
    exitCode: 1
    output: [
      {
        "turn": 1,
        "stderr": "fake-crasher: no space left on device",
        "result": "{\\"error\\":\\"crashed\\"}"
      }
    ]`);
    expect(log).toContain("WARN: execution: agent timed out");
    // Its stderr is kept in its postrun image, beside its result file.
    expect(await docker.fileIn(`thunderjar-postrun:${store.execution.executionId}-2-1`, "/thunderjar/stderr.log")).toBe(
      "fake-crasher: no space left on device\n",
    );
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
Stderr       0 bytes

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
    // Pushed and measured, the postrun image is removed from the runtime, by both its tags. The prerun image stays.
    expect(commands.filter((command) => command.includes(" image rm "))).toEqual([`${REMOTE} image rm thunderjar-postrun:${executionId}-1-1 ${postrun}`]);
    // Its disk usage is logged before and after.
    expect(commands.filter((command) => command.startsWith(`${REMOTE} system df`))).toHaveLength(2);
    expect(await docker.images()).toEqual(["thunderjar-prerun:ae60c784", PRERUN]);
  });

  test("with keepPostrunImages, each postrun image stays on the runtime", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyScenarioProject("0211");
    const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    await Bun.write(config, (await Bun.file(config).text()).replace('"--context", "cloud"]', '"--context", "cloud"], keepPostrunImages: true'));
    const data = dataDir();

    const { exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect((await docker.commands()).some((command) => command.includes(" image rm "))).toBe(false);
    expect(await docker.images()).toContain(`thunderjar-postrun:${executionId}-1-1`);
  });

  test("a postrun image that can't be removed from the runtime doesn't fail the run: it's recorded, pushed and measured", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();
    // The fake fails to remove any image named in `failing`; the postrun image's name isn't known until it runs.
    const { stdout, stderr, exitCode, log } = await thunderjar(scenario("0211"), ["run", "example", "--data-dir", data], {
      env: { ...docker.env, FAKE_DOCKER_FAIL_IMAGE_RM: "1" },
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("isPrimeTemplateTest: {passed: 3, failed: 2}");
    expect((await readStore(data)).execution.status).toBe("complete");
    expect(log).toContain("WARN: execution: couldn't remove the postrun image from the runtime");
  });

  test("--timings prints how long each phase took, once the run and the runtime's afterRun are done", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["run", "example", "--timings", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    const from = lines.indexOf("Timings: <duration> in all");
    expect(from).toBeGreaterThan(lines.findIndex((line) => line.startsWith("Recorded in ")));
    expect(lines.slice(from + 1, -1).map((line) => line.trim().replace(/ {2,}/g, "  "))).toEqual([
      "building prerun images  1×  total <duration>  longest <duration>",
      "pushing prerun images  1×  total <duration>  longest <duration>",
      "pulling prerun images into the runtime  1×  total <duration>  longest <duration>",
      "running agents  1×  total <duration>  longest <duration>",
      "reading what agents left  1×  total <duration>  longest <duration>",
      "committing postrun images  1×  total <duration>  longest <duration>",
      "pushing postrun images  1×  total <duration>  longest <duration>",
      "measuring  1×  total <duration>  longest <duration>",
      "removing images from the runtime  1×  total <duration>  longest <duration>",
    ]);
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
        ` 1/1  iteration ${n}/3  fake-harness-alpha | plain  isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1`,
        expect.stringMatching(/  pushed ghcr\.io\/acme\/thunderjar-images:postrun-/),
      ]);
    }
    const { execution, containerRuns } = await readStore(data);
    expect(execution.status).toBe("complete");
    expect(containerRuns.map((run) => run.iteration).sort()).toEqual([1, 2, 3]);
    expect(containerRuns.every((run) => run.result !== undefined && Object.keys(run.result).length === 3)).toBe(true);
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
    expect(lines).toContain(`Pulled ghcr.io/acme/thunderjar-images:prerun-h${alpha.split(":")[1]} into the runtime`);
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
    expect(Object.keys(containerRuns[0]?.result ?? {})).toHaveLength(3);
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

  /** A copy of 0211 with 2 iterations and concurrency 2, whose runtime's hooks run `beforeRun` and `afterRun` with `sh -c`, and where they write to. */
  async function copyWithHooks(beforeRun: string, afterRun: string) {
    const copy = await copyWith(2);
    const log = `${copy.dir}/hooks.log`;
    const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    const hook = (script: string) => JSON.stringify(["sh", "-c", script.replaceAll("$LOG", log)]);
    await Bun.write(
      config,
      (await Bun.file(config).text())
        .replace("iterations: 3", "iterations: 2")
        .replace("concurrency: 2", `concurrency: 2, beforeRun: ${hook(beforeRun)}, afterRun: ${hook(afterRun)}`),
    );
    const testCase = `${copy.dir}/.thunderjar/test-cases/example.ts`;
    await Bun.write(testCase, (await Bun.file(testCase).text()).replace("iterations: 3", "iterations: 2"));
    return Object.assign(copy, { log });
  }

  const LOGS = 'echo "$0 $THUNDERJAR_EXECUTION_ID $THUNDERJAR_CONCURRENCY $THUNDERJAR_CONTAINERS" >> $LOG';

  test("beforeRun runs before anything runs on the runtime, and afterRun once it's done, each told about the run", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks(`${LOGS.replace("$0", "before")}`, `${LOGS.replace("$0", "after")}`);
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    expect(await Bun.file(copy.log).text()).toBe(`before ${executionId} 2 2\nafter ${executionId} 2 2\n`);
    const lines = stdout.split("\n");
    const before = lines.findIndex((line) => line.startsWith("Running the runtime's beforeRun, `sh -c "));
    const after = lines.findIndex((line) => line.startsWith("Running the runtime's afterRun, `sh -c "));
    expect(lines[before]).toEndWith("... done");
    expect(lines[after]).toEndWith("... done");
    expect(before).toBeLessThan(lines.findIndex((line) => line.includes("iteration 1/2")));
    expect(after).toBe(lines.findIndex((line) => line.startsWith("Recorded in ")) + 1);
  }, 30_000);

  test("a beforeRun that fails is an error, and nothing else runs, afterRun included", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    await using copy = await copyWithHooks("echo starting; echo no machine to start >&2; exit 3", LOGS.replace("$0", "after"));
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toMatch(/Running the runtime's beforeRun, `sh -c .*` \.\.\. failed\n$/);
    expect(stderr).toBe("Error: The runtime's beforeRun failed: no machine to start\n");
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => / (build|push|pull|run) /.test(command))).toEqual([]);
    expect(await Bun.file(copy.log).exists()).toBe(false);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("afterRun runs after a run that failed, and an afterRun that fails is an error", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:ae60c784"], pullDenied: true });
    await using copy = await copyWithHooks(LOGS.replace("$0", "before"), `${LOGS.replace("$0", "after")}; exit 1`);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(await Bun.file(copy.log).text()).toMatch(/^before .*\nafter .*\n$/);
    expect(stdout).toMatch(/Running the runtime's afterRun, `sh -c .*` \.\.\. failed\n$/);
    expect(stderr).toStartWith("Error: The runtime couldn't pull ");
    expect(stderr).toEndWith(`Error: The runtime's afterRun failed: \`sh -c ${LOGS.replace("$0", "after").replace("$LOG", "<PROJECT>/hooks.log")}; exit 1\` exited 1\n`);
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
