// More of `thunderjar run`, through the CLI: see run.test.ts. Split from it so that
// `bun test --parallel` runs the two in separate workers.
import { afterEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { instruments } from "../../../instruments/instruments.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";
import { KEY, TEST_CASE_SECRET, dataDir, permutation, readStore, removeDataDirs } from "./runTestSupport.ts";

const KNOWN_INSTRUMENTS = Object.keys(instruments).join(", ");

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
  test("an agent that exits non-zero or leaves no result file is marked: the one that exits non-zero isn't measured, the silent one is", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode, log } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toBe(`Execution <ULID>  misbehaving
  3 permutations, 3 runs, up to 1 at once

Images
  thunderjar-prerun:1d9d07c1  ready
  thunderjar-prerun:8458d2af  ready
  thunderjar-prerun:53b26258  ready

Runs
  1.1  fake-sleeper/fake-model-small-001  completed  0:00
       isPrimeTsExists: true
  2.1  fake-crasher/fake-model-small-001  crashed (exited 1)  0:00
  3.1  fake-silent/fake-model-small-001   completed  0:00
       isPrimeTsExists: true

3 runs: 2 completed, 1 crashed
Recorded in <DATA>/runs.sqlite
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    const [sleeper, crasher, silent] = store.containerRuns as [ContainerRunRecord, ContainerRunRecord, ContainerRunRecord];
    expect(sleeper.execution).toMatchObject({ exitCode: 0, timedOut: false });
    expect(crasher.execution).toMatchObject({ exitCode: 1, timedOut: false });
    expect(crasher.harnessResult).toBe('{"error":"crashed"}\n');
    // The one that crashed is recorded and committed, but not measured.
    expect(crasher.result).toEqual({});
    expect(Object.keys(sleeper.result)).toEqual(["isPrimeTsExists"]);
    expect(Object.keys(silent.result)).toEqual(["isPrimeTsExists"]);
    expect(silent.execution).toMatchObject({ exitCode: 0, timedOut: false });
    expect(silent.harnessResult).toBeNull();
    // The log says why each failed: what the agent wrote to stderr, and its result file.
    expect(log).toContain(`WARN: runNext: agent didn't end cleanly
    executionId: "<ULID>"
    runId: "<ULID>-ca2ae3ae-i1"
    permutation: 2
    iteration: 1
    outcome: "crashed"
    output: [
      {
        "turn": 1,
        "stderr": "fake-crasher: no space left on device",
        "result": "{\\"error\\":\\"crashed\\"}"
      }
    ]`);
    // Its stderr is kept in its postrun image, beside its result file.
    expect(await docker.fileIn(`thunderjar-postrun:${store.execution.executionId}-2-1`, "/thunderjar/stderr.log")).toBe(
      "fake-crasher: no space left on device\n",
    );
    // Each was committed, and removed.
    const id = store.execution.executionId;
    for (const n of [1, 2, 3]) expect(await docker.images()).toContain(`thunderjar-postrun:${id}-${n}-1`);
    expect(await docker.containers()).toEqual([]);
    // A measurement container was started from the sleeper's and the silent one's postrun images only.
    const measured = (await docker.commands()).filter((command) => command.startsWith("docker run --rm --interactive"));
    expect(measured.map((command) => /thunderjar-postrun:\S+/.exec(command)?.[0])).toEqual([`thunderjar-postrun:${id}-1-1`, `thunderjar-postrun:${id}-3-1`]);
  }, 30_000);

  test("a container that never starts is that run's outcome, given up on before it exists, and the execution goes on to the end", async () => {
    // fake-crasher's container would take a minute to appear: it's given up on after 3s.
    await using docker = await fakeDocker({ slowStart: { "-2-1": 60 } });
    const data = dataDir();

    const { stdout, stderr, exitCode, log } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data], {
      env: { ...docker.env, THUNDERJAR_START_TIMEOUT_SECONDS: "3" },
      paths: { "<DATA>": data },
      log: true,
    });

    // No execution-level error: the run's own line says it failed to start, and the rest ran.
    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    // The crasher's duration is how long it was waited for: 3s, or a little over.
    expect(stdout.replace(/\(didn't start\)  0:0\d/, "(didn't start)  0:0N")).toEndWith(`
Runs
  1.1  fake-sleeper/fake-model-small-001  completed  0:00
       isPrimeTsExists: true
  2.1  fake-crasher/fake-model-small-001  crashed (didn't start)  0:0N
       Its container didn't start: it didn't start within <duration>
  3.1  fake-silent/fake-model-small-001   completed  0:00
       isPrimeTsExists: true

3 runs: 2 completed, 1 crashed
Recorded in <DATA>/runs.sqlite
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    expect(store.containerRuns).toHaveLength(3);
    const crasher = store.containerRuns[1] as ContainerRunRecord;
    expect(crasher.execution).toMatchObject({ exitCode: null, timedOut: false, timeoutSeconds: 2, failedToStart: "it didn't start within 3s" });
    expect(crasher).toMatchObject({ harnessResult: null, harnessStderr: null, result: {} });
    // It was removed, before it existed, rather than killed; nothing was committed or measured for it.
    const id = store.execution.executionId;
    const commands = await docker.commands();
    expect(commands.filter((command) => command.includes(`thunderjar-run-${id}-2-1`) && command.startsWith("docker kill"))).toEqual([]);
    expect(commands).toContain(`docker rm --force thunderjar-run-${id}-2-1`);
    expect(commands.filter((command) => command.includes(`thunderjar-postrun:${id}-2-1`))).toEqual([]);
    expect(log).toContain("WARN: runNext: container didn't start");
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

${permutation(1, "8d593fe0", 1)}

Permutation 2: prerun image thunderjar-prerun:8d593fe0
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
    expect(runs[1]).toContain(` --pull never ${OPTIONS} --entrypoint sh thunderjar-prerun:8d593fe0 -c `);
  });

  test("scrubbed-env: the postrun image holds no value the agent was run with, and its base image's own", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "scrubbed-env", "--data-dir", data], {
      env: { ...docker.env, FAKE_HARNESS_KEY: "secret-harness-key", FAKE_RUN_OPTION_KEY: "secret-run-option-key" },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    // The agent saw every variable it was given.
    expect(record.reply).toEqual({ outcome: "collected", text: "key set, run option set, overridden set" });
    expect(await docker.envOf(record.postrunImage)).toEqual([
      'FAKE_IMAGE_SETTING=kept: "quoted", $HOME, a \\ backslash and 100%',
      "FAKE_OVERRIDDEN=image-value",
      "FAKE_HARNESS_KEY=",
      "FAKE_RUN_OPTION_KEY=",
    ]);
  });
});

describe("0206 test-case-env: a test case's own env and secretEnv", () => {
  const SETTING = "FAKE_TEST_CASE_SETTING=test";
  const AWKWARD_VALUE = 'kept: "quoted", $HOME, a \\ backslash and 100%';
  const secret = TEST_CASE_SECRET.FAKE_TEST_CASE_SECRET;

  test("--dry-run: secretEnv by name, env with its values, an awkward one quoted", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "test-case-env", "--dry-run"], { env: TEST_CASE_SECRET });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:70748710
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    env:      FAKE_TEST_CASE_SECRET, ${SETTING}, FAKE_TEST_CASE_AWKWARD=${JSON.stringify(AWKWARD_VALUE)}
    command:  sh /thunderjar/thunderjar-run.sh
`);
  });

  test("an unset or empty secretEnv stops run, and its dry run, before anything is built", async () => {
    await using docker = await fakeDocker();
    const MISSING = "Error: The test case needs FAKE_TEST_CASE_SECRET, in its secretEnv, which is not set.\nExport it in the shell that runs thunderjar.\n";

    for (const args of [["--dry-run"], ["--data-dir", dataDir()]]) {
      for (const value of [undefined, ""]) {
        const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "test-case-env", ...args], {
          env: { ...docker.env, ...(value !== undefined && { FAKE_TEST_CASE_SECRET: value }) },
        });
        expect(stdout).toBe("");
        expect(stderr).toBe(MISSING);
        expect(exitCode).toBe(1);
      }
    }
    expect(await docker.commands()).toEqual([]);
  });

  test("the agent sees both; the secret's value is in no command, log, record or postrun image, and env's values stay in the postrun image", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stderr, exitCode, log } = await thunderjar(scenario("0206"), ["run", "test-case-env", "--data-dir", data, "-v"], {
      env: { ...docker.env, ...TEST_CASE_SECRET },
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const store = await readStore(data);
    const [record] = store.containerRuns as [ContainerRunRecord];
    expect(record.reply).toEqual({ outcome: "collected", text: "setting test, awkward set, secret set" });
    // Recorded: env with its values, secretEnv by name only.
    expect(record.env).toEqual({ FAKE_TEST_CASE_SETTING: "test", FAKE_TEST_CASE_AWKWARD: AWKWARD_VALUE });
    expect(record.secretEnv).toEqual(["FAKE_TEST_CASE_SECRET"]);

    const commands = await docker.commands();
    const [run] = commands.filter((command) => command.startsWith("docker run --name")) as [string];
    // env's after any run options, so it wins, and is what the postrun image keeps; the secret by name.
    expect(run).toContain(` -e ${SETTING} -e FAKE_TEST_CASE_AWKWARD=${AWKWARD_VALUE} -e FAKE_TEST_CASE_SECRET --entrypoint sh `);
    expect(commands.filter((command) => command.includes(secret))).toEqual([]);
    expect(log).toContain("FAKE_TEST_CASE_SECRET");
    expect(log).not.toContain(secret);
    expect(JSON.stringify(store)).not.toContain(secret);
    expect(await docker.envOf(record.postrunImage)).toEqual([SETTING, `FAKE_TEST_CASE_AWKWARD=${AWKWARD_VALUE}`, "FAKE_TEST_CASE_SECRET="]);
  });

  test("env and secretEnv change no hash: the prerun image is the same without them", async () => {
    const withEnv = JSON.parse((await thunderjar(scenario("0206"), ["run", "test-case-env", "--dry-run", "--json"], { env: TEST_CASE_SECRET })).stdout);
    expect(withEnv).toMatchObject({ runs: {}, images: {}, uploadBacklog: 0, mode: "dry-run" });
    expect(withEnv.manifest.permutations).toHaveLength(1);
    expect(withEnv.manifest.permutations[0].testCaseEnv).toEqual({ FAKE_TEST_CASE_SETTING: "test", FAKE_TEST_CASE_AWKWARD: AWKWARD_VALUE });
    expect(withEnv.manifest.permutations[0].secretEnv).toEqual(["FAKE_TEST_CASE_SECRET"]);

    await using copy = await copyScenarioProject("0206");
    const file = `${copy.dir}/.thunderjar/test-cases/test-case-env.ts`;
    const text = await Bun.file(file).text();
    await Bun.write(file, text.slice(0, text.indexOf("  env: {")) + "});\n");
    const without = JSON.parse((await thunderjar(copy.dir, ["run", "test-case-env", "--dry-run", "--json"])).stdout);

    expect(without.manifest.permutations[0].testCaseEnv).toEqual({});
    expect(without.manifest.permutations[0].secretEnv).toEqual([]);
    expect(without.manifest.permutations[0].hash).toBe(withEnv.manifest.permutations[0].hash);
    expect(without.manifest.permutations[0].prerunImage).toBe(withEnv.manifest.permutations[0].prerunImage);
    expect(withEnv.manifest.permutations[0].prerunImage).toBe("thunderjar-prerun:70748710");
  });
});

describe("0202 with a harness that needs one of two variables", () => {
  /** A copy of 0202 whose fake-harness-alpha needs FAKE_HARNESS_TOKEN or FAKE_HARNESS_KEY, and says which it got. */
  const copyWithOneOf = async () => {
    const copy = await copyScenarioProject("0202");
    const harness = `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`;
    const text = await Bun.file(harness).text();
    await Bun.write(harness, text.replace('requiredEnv: ["FAKE_HARNESS_KEY"]', 'requiredEnv: [{ oneOf: ["FAKE_HARNESS_TOKEN", "FAKE_HARNESS_KEY"] }]'));
    return copy;
  };

  test("with neither set, run names both, and the harness, and stops", async () => {
    await using docker = await fakeDocker();
    await using copy = await copyWithOneOf();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "Error: fake-harness-alpha needs one of FAKE_HARNESS_TOKEN or FAKE_HARNESS_KEY, none of which is set.\nExport it in the shell that runs thunderjar.\n",
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });

  test("with both set, only the first reaches the agent, and the record names it", async () => {
    await using docker = await fakeDocker();
    await using copy = await copyWithOneOf();
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], {
      env: { ...docker.env, FAKE_HARNESS_TOKEN: "fake-token", ...KEY },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [run] = (await docker.commands()).filter((command) => command.startsWith("docker run --name")) as [string];
    expect(run).toContain(" -e FAKE_HARNESS_TOKEN ");
    expect(run).not.toContain("FAKE_HARNESS_KEY");
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.harnessEnv).toEqual(["FAKE_HARNESS_TOKEN"]);
  });

  test("with only the second set, it's the one passed", async () => {
    await using docker = await fakeDocker();
    await using copy = await copyWithOneOf();
    const data = dataDir();

    const { exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(0);
    const [run] = (await docker.commands()).filter((command) => command.startsWith("docker run --name")) as [string];
    expect(run).toContain(" -e FAKE_HARNESS_KEY ");
    expect(run).not.toContain("FAKE_HARNESS_TOKEN");
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.harnessEnv).toEqual(["FAKE_HARNESS_KEY"]);
  });
});

describe("0206 measured-env: a run's variables reach its measurement containers", () => {
  const secrets = { FAKE_HARNESS_KEY: "secret-harness-key", ...TEST_CASE_SECRET };

  test("the measurement sees the test case's env, its secretEnv and the harness's requiredEnv; no secret's value is in a command, log or record", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stderr, exitCode, log } = await thunderjar(scenario("0206"), ["run", "measured-env", "--data-dir", data, "-v"], {
      env: { ...docker.env, ...secrets },
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const store = await readStore(data);
    const [record] = store.containerRuns as [ContainerRunRecord];
    expect(record.reply).toEqual({ outcome: "collected", text: "key set, run option , overridden " });
    // The shell measurement prints whether each secret is set and not blank, never its value.
    expect(record.result.envSeen).toMatchObject({ outcome: { outcome: "measured", data: { exitCode: 0, stdout: "setting test, secret set, key set\n" } } });

    const commands = await docker.commands();
    const [session] = commands.filter((command) => command.startsWith("docker run --rm --interactive")) as [string];
    // By name: Docker copies each value from Thunderjar's own environment.
    expect(session).toContain(" -e FAKE_HARNESS_KEY -e FAKE_TEST_CASE_SECRET --entrypoint sh ");
    for (const value of Object.values(secrets)) {
      expect(commands.filter((command) => command.includes(value))).toEqual([]);
      expect(log).not.toContain(value);
      expect(JSON.stringify(store)).not.toContain(value);
    }
  });
});

describe("0206 leaked-secret: a run's secret values, written into files, are found in its postrun image", () => {
  const secrets = { FAKE_HARNESS_KEY: "secret-harness-key", ...TEST_CASE_SECRET };

  test("each secret found is recorded by name, with the paths of the files that hold it", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { exitCode } = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--data-dir", data], { env: { ...docker.env, ...secrets } });

    expect(exitCode).toBe(0);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.reply).toEqual({ outcome: "collected", text: "leaked" });
    expect(record).toMatchObject({
      secretsFound: [
        { name: "FAKE_HARNESS_KEY", files: 2, paths: ["/workspace/.env", "/workspace/agent.log"] },
        { name: "FAKE_TEST_CASE_SECRET", files: 1, paths: ["/workspace/.env"] },
      ],
    });
  });

  test("run warns, under each run, which secrets its postrun image holds, and that a pushed one's are exposed", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--data-dir", dataDir()], { env: { ...docker.env, ...secrets } });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`
Runs
  1.1  fake-leaker/fake-model-small-001  completed  0:00
       sandboxed: false
       Its postrun image holds the value of FAKE_HARNESS_KEY (2 files: /workspace/.env, /workspace/agent.log)
       Its postrun image holds the value of FAKE_TEST_CASE_SECRET (1 file: /workspace/.env)

1 run: 1 completed
1 postrun image of 1 hold a secret's value in their files. Treat one that was pushed as exposed, and rotate it.
Recorded in `);
  });

  test("a search that times out doesn't fail the run: it's recorded as not done, and run says so", async () => {
    await using docker = await fakeDocker({ slowStart: { "-secrets": 5 } });
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--data-dir", data], {
      env: { ...docker.env, ...secrets, THUNDERJAR_SECRET_SEARCH_TIMEOUT_SECONDS: "1" },
    });

    expect(exitCode).toBe(0);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record).toMatchObject({ secretSearchFailed: "it took longer than 1s" });
    expect(record).not.toHaveProperty("secretsFound");
    expect(stdout).toContain(`
Runs
  1.1  fake-leaker/fake-model-small-001  completed  0:00
       sandboxed: false
       Its postrun image couldn't be searched for secrets: it took longer than <duration>

1 run: 1 completed
Recorded in `);
  });

  test("no secret's value is in a command, the log, the record or the output; the search is given each by name", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, log } = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--data-dir", data, "--log-level", "trace"], {
      env: { ...docker.env, ...secrets },
      log: true,
    });

    const commands = await docker.commands();
    const [search] = commands.filter((command) => command.startsWith("docker run --name ") && command.includes("-secrets ")) as [string];
    expect(search).toContain(" -e FAKE_HARNESS_KEY -e FAKE_TEST_CASE_SECRET --user 0 --network none --entrypoint sh thunderjar-postrun:");
    expect(log).toContain("secrets found in the postrun image's files");
    const store = JSON.stringify(await readStore(data));
    for (const value of Object.values(secrets)) {
      for (const text of [commands.join("\n"), log, store, stdout, stderr]) expect(text).not.toContain(value);
    }
  });

  test("a clean run, and one whose secrets are too short to search for, record nothing, and run says nothing", async () => {
    await using docker = await fakeDocker();
    const [cleanData, shortData] = [dataDir(), dataDir()];

    const clean = await thunderjar(scenario("0206"), ["run", "test-case-env", "--data-dir", cleanData], { env: { ...docker.env, ...TEST_CASE_SECRET } });
    const short = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--data-dir", shortData], {
      env: { ...docker.env, FAKE_HARNESS_KEY: "short-key", FAKE_TEST_CASE_SECRET: "short" },
    });

    // The test case's name aside, neither frame mentions a secret.
    for (const { stdout, exitCode } of [clean, short]) {
      expect(exitCode).toBe(0);
      expect(stdout.replace("leaked-secret", "<test case>")).not.toContain("secret");
      expect(stdout).toContain("\n\n1 run: 1 completed\nRecorded in ");
    }
    const runs = [...(await readStore(cleanData)).containerRuns, ...(await readStore(shortData)).containerRuns];
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run).not.toHaveProperty("secretsFound");
      expect(run).not.toHaveProperty("secretSearchFailed");
    }
    // Searched once: test-case-env's secret, not leaked-secret's short ones.
    expect((await docker.commands()).filter((command) => command.includes("-secrets "))).toHaveLength(1);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "4799f255", 1)}
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
      `Error: .thunderjar/parameters/tasks/unknown-instrument/measurements/isPrimeTsExists.ts: instrument: "fileCraeted" is not a known instrument. Known instruments: ${KNOWN_INSTRUMENTS}\n`,
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
  const PRERUN = `${REPOSITORY}:prerun-h4799f255`;

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

  test("pushes the prerun image once built, and the postrun image once committed, and runs from the stored reference", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-h0af800ad-i00`;
    expect(stdout).toBe(`Execution <ULID>  example
  1 permutation, 1 run, up to 1 at once, images stored in ${REPOSITORY}

Images
  ${PRERUN}  ready

Runs
  1.1  fake-harness-alpha/fake-model-small-001  completed  0:00  uploaded
       isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   tsIgnoreCount: 1

1 run: 1 completed
Recorded in <REPO>/fixtures/.tmp/data-<UUID>/runs.sqlite
`);
    expect(await docker.pushed()).toEqual([PRERUN, postrun]);
    expect(((await readStore(data)).containerRuns as ContainerRunRecord[]).map((run) => run.postrunImage)).toEqual([postrun]);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker login ghcr.io");
    // Built, then pushed under its stored reference, before the agent's container, which runs from that reference.
    const build = commands.findIndex((command) => command.startsWith("docker build"));
    const pushPrerun = commands.indexOf(`docker push --quiet ${PRERUN}`);
    const run = commands.findIndex((command) => command.startsWith("docker run --name"));
    expect(build).toBeGreaterThan(0);
    expect(pushPrerun).toBeGreaterThan(build);
    expect(run).toBeGreaterThan(pushPrerun);
    expect(commands[run]).toContain(` --entrypoint sh ${PRERUN} -c `);
    // The postrun image is committed under its local name, then tagged and pushed: before, during or after measuring.
    const local = `thunderjar-postrun:${executionId}-1-1`;
    const commit = commands.findIndex((command) => command.startsWith("docker commit") && command.endsWith(` ${local}`));
    const tag = commands.indexOf(`docker tag ${local} ${postrun}`);
    expect(commit).toBeGreaterThan(run);
    expect(tag).toBeGreaterThan(commit);
    expect(commands.indexOf(`docker push --quiet ${postrun}`)).toBeGreaterThan(tag);
    // Measured once, in a container of the committed image.
    const measuring = commands.filter((command) => command.includes("-measure-"));
    expect(measuring).toHaveLength(1);
    expect(measuring[0]).toContain(` --entrypoint sh ${local} -c `);
    expect(commands.indexOf(measuring[0] as string)).toBeGreaterThan(commit);
  });

  test("a prerun push the registry refuses is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:4799f255"], failing: [PRERUN] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`Execution <ULID>  example
  1 permutation, 1 run, up to 1 at once, images stored in ${REPOSITORY}

Images
  ${PRERUN}  failed
`);
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
