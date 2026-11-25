/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { plain } from "../../cli/colour.ts";
import { emptyRunState } from "../../services/ApplicationState/ApplicationState.ts";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure } from "../../services/RunDataStore/RunDataStore.ts";
import type { Manifest, PlannedPermutation, PlannedRun, RunDetails, RunEvent, RunMode, RunStateOf } from "../types.ts";
import { createRunRenderer, runJson } from "./renderRun.ts";

type ManifestOptions = {
  /** One permutation per harness. */
  harnesses?: string[];
  iterations?: number;
  concurrency?: number;
  buildConcurrency?: number;
  /** A repository, if images are pushed. */
  store?: string;
  runtime?: { command: string[]; beforeExecution?: string[]; afterExecution?: string[] } | null;
  env?: string[];
  testCaseEnv?: Record<string, string>;
  runOptions?: string[];
};

/** A manifest with only what the renderer reads. */
function manifestOf(options: ManifestOptions = {}): Manifest {
  const { harnesses = ["alpha"], iterations = 1, concurrency = 1, buildConcurrency = 1, store, runtime = null, env = [], testCaseEnv = {}, runOptions = [] } = options;
  const permutations = harnesses.map((harness, index) => {
    const hashed = { baseImage: "base", codeState: "code", promptSet: "prompts", harnessModel: `${harness}/model-1`, initialPrompt: "plain", hash: `hash${index + 1}`, modelId: "model-1" };
    return {
      hashed,
      number: index + 1,
      hash: hashed.hash,
      modelId: "model-1",
      version: "1.0.0",
      prerunImage: `prerun:${harness}`,
      env,
      secretEnv: [],
      testCaseEnv,
      runOptions,
      timeoutSeconds: 600,
    } as unknown as PlannedPermutation;
  });
  const runs: PlannedRun[] = permutations.flatMap((permutation) =>
    Array.from({ length: iterations }, (_, index) => ({
      runId: `E1-${permutation.number}-${index + 1}`,
      permutationHash: permutation.hash,
      iteration: index + 1,
      permutation,
      container: `container-${permutation.number}-${index + 1}`,
      postrunImage: `postrun:E1-${permutation.number}-${index + 1}`,
      ...(store !== undefined && { storedPostrunImage: `${store}:postrun-${permutation.number}-${index + 1}` }),
    })),
  );
  const config = {
    name: "example",
    iterations,
    baseImage: ["base"],
    codeState: ["code"],
    promptSet: ["prompts"],
    harnessModel: harnesses.map((harness) => `${harness}/model-1`),
    initialPrompt: ["plain"],
    overrides: { iterations },
    build: { concurrency: buildConcurrency },
    runtime,
  } as unknown as Manifest["config"];
  return { executionId: "E1", testCaseName: "example", task: "task", concurrency, config, permutations, runs };
}

const stateOf = (manifest: Manifest, log: RunEvent[] = [], more: Partial<RunDetails> = {}, mode: RunMode = "full"): RunStateOf => ({
  ...emptyRunState<Manifest, RunDetails>(),
  manifest,
  details: { mode, startedAt: 0, log, phases: {}, ...more },
});

/** A container run's record: by default one that took 1.5s and ended cleanly. */
const recordOf = (execution: Partial<ContainerRunRecord["execution"]> = {}, more: Partial<ContainerRunRecord> = {}) =>
  ({ execution: { startedAt: 0, finishedAt: 1500, exitCode: 0, timedOut: false, ...execution }, harnessResult: "{}", ...more }) as ContainerRunRecord;

const measures = (values: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(values).map(([name, data]) => [name, { outcome: { outcome: "measured", data } } as RecordedMeasure]));

const finishedOf = (recordedIn = "/work/.data/runs.sqlite", status: ExecutionRecord["status"] = "complete"): NonNullable<RunDetails["finished"]> => ({
  execution: { executionId: "E1", status } as ExecutionRecord,
  recordedIn,
  containerRuns: [],
  timings: { wallMs: 2500, phases: { agent: { count: 1, totalMs: 1500, maxMs: 1500 } } },
});

const render = createRunRenderer({ paint: plain, cwd: "/work", showTimings: false });

/** A whole run of `runId`, from `at`: started, ran, measured, done. */
const ranEvents = (runId: string, at: number): RunEvent[] => [
  { type: "run", runId, step: "started", at },
  { type: "run", runId, step: "ran", record: recordOf(), at: at + 1500 },
  { type: "run", runId, step: "measuring", at: at + 1500 },
  { type: "run", runId, step: "measured", result: measures({ passed: true }), at: at + 1600 },
  { type: "run", runId, step: "done", at: at + 1600 },
];

describe("an empty state", () => {
  test("has an empty frame, and no JSON", () => {
    expect(render(emptyRunState(), 0)).toEqual({ settled: "", live: "" });
    expect(runJson(emptyRunState())).toBeUndefined();
  });
});

describe("a dry run", () => {
  const manifest = manifestOf({ harnesses: ["alpha", "beta"], iterations: 2, env: ["API_KEY"], testCaseEnv: { MODE: "fast" }, runOptions: ["--privileged"] });
  const state = stateOf(manifest, [], {}, "dry-run");

  test("is settled at once: each permutation's prerun image, and each iteration's postrun image, environment and command", () => {
    const block = (permutation: number, harness: string) =>
      [
        `Permutation ${permutation}: prerun image prerun:${harness}`,
        ...[1, 2].flatMap((iteration) => [
          `  Iteration ${iteration}: postrun image postrun:E1-${permutation}-${iteration}`,
          "    env:      API_KEY, MODE=fast",
          "    docker:   --privileged",
          "    command:  sh /thunderjar/thunderjar-run.sh",
        ]),
      ].join("\n");

    expect(render(state, 0)).toEqual({ settled: `Execution E1\n\n${block(1, "alpha")}\n\n${block(2, "beta")}\n`, live: "" });
  });

  test("as JSON, is the plan: the overrides given, and each permutation with its iterations", () => {
    expect(runJson(state)).toEqual({
      executionId: "E1",
      overrides: { iterations: 2 },
      permutations: ["alpha", "beta"].map((harness, index) => ({
        number: index + 1,
        parameters: { baseImage: "base", codeState: "code", promptSet: "prompts", harnessModel: `${harness}/model-1`, initialPrompt: "plain" },
        modelId: "model-1",
        harnessVersion: "1.0.0",
        hash: `hash${index + 1}`,
        prerunImage: `prerun:${harness}`,
        env: ["API_KEY"],
        testCaseEnv: { MODE: "fast" },
        secretEnv: [],
        runOptions: ["--privileged"],
        timeoutSeconds: 600,
        iterations: [1, 2].map((number) => ({ number, postrunImage: `postrun:E1-${index + 1}-${number}`, command: "sh /thunderjar/thunderjar-run.sh" })),
      })),
    });
  });
});

describe("the header", () => {
  test("is the execution's ID alone, one container at a time on this machine", () => {
    expect(render(stateOf(manifestOf()), 0)).toEqual({ settled: "Execution E1\n", live: "" });
  });

  test("says how containers are run on a runtime, and how many of each at once", () => {
    const manifest = manifestOf({ runtime: { command: ["ssh", "box", "docker"] }, concurrency: 3, buildConcurrency: 2 });

    expect(render(stateOf(manifest), 0).settled).toBe("Execution E1\nRunning containers with `ssh box docker`\nUp to 3 containers at once\nBuilding up to 2 prerun images at once\n");
  });
});

describe("one at a time", () => {
  test("each step is one line, ended with how it went", () => {
    const manifest = manifestOf({ harnesses: ["alpha", "beta"], store: "registry/images", runtime: { command: ["docker"], beforeExecution: ["wake", "up"] } });
    const log: RunEvent[] = [
      { type: "hook", hook: "beforeExecution", command: ["wake", "up"], step: "running", at: 0 },
      { type: "hook", hook: "beforeExecution", command: ["wake", "up"], step: "done", at: 10 },
      { type: "image", image: "prerun:alpha", step: "building", at: 10 },
      { type: "image", image: "prerun:alpha", step: "built", at: 20 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pushing", at: 20 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pushed", at: 30 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pulling", at: 30 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pulled", at: 40 },
      { type: "run", runId: "E1-1-1", step: "started", at: 40 },
      { type: "run", runId: "E1-1-1", step: "ran", record: recordOf({}, { tokenCosts: undefined }), at: 1540 },
      { type: "run", runId: "E1-1-1", step: "measuring", at: 1540 },
      { type: "run", runId: "E1-1-1", reference: "registry/images:postrun-1-1", step: "uploading", at: 1541 },
      { type: "run", runId: "E1-1-1", step: "measured", result: measures({ passed: true, count: { lines: 3 } }), at: 1600 },
      { type: "run", runId: "E1-1-1", reference: "registry/images:postrun-1-1", step: "uploaded", at: 1700 },
      { type: "run", runId: "E1-1-1", step: "done", at: 1700 },
    ];

    expect(render(stateOf(manifest, log), 2000)).toEqual({
      settled: [
        "Execution E1",
        "Running containers with `docker`",
        "Running the runtime's beforeExecution, `wake up` ... done",
        "Building prerun:alpha ... done",
        "Pushing registry/images:alpha ... done",
        "Pulling registry/images:alpha into the runtime ... done",
        " 1/2  iteration 1/1  alpha | plain  ... done (1.5s)",
        "      passed: true   count: {lines: 3}",
        "      Pushing registry/images:postrun-1-1 ... done",
        "",
      ].join("\n"),
      live: "",
    });
  });

  test("a step still waiting is live, with how long it's been, and settles once it ends", () => {
    const manifest = manifestOf();
    const building: RunEvent = { type: "image", image: "prerun:alpha", step: "building", at: 1000 };

    expect(render(stateOf(manifest, [building]), 66_000)).toEqual({ settled: "Execution E1\n", live: "Building prerun:alpha ... 1m 05s\n" });
    expect(render(stateOf(manifest, [building, { type: "image", image: "prerun:alpha", step: "built", at: 70_000 }]), 70_000)).toEqual({
      settled: "Execution E1\nBuilding prerun:alpha ... done\n",
      live: "",
    });
  });

  test("a build that failed ends its line with failed", () => {
    const log: RunEvent[] = [
      { type: "image", image: "prerun:alpha", step: "building", at: 0 },
      { type: "image", image: "prerun:alpha", step: "buildFailed", at: 500 },
    ];

    expect(render(stateOf(manifestOf(), log), 500)).toEqual({ settled: "Execution E1\nBuilding prerun:alpha ... failed\n", live: "" });
  });

  test("a run's line waits for its agent, then for its measures", () => {
    const manifest = manifestOf();
    const [started, ran, measuring, measured, done] = ranEvents("E1-1-1", 0) as [RunEvent, RunEvent, RunEvent, RunEvent, RunEvent];
    const head = " 1/1  iteration 1/1  alpha | plain  ... ";

    expect(render(stateOf(manifest, [started]), 7000).live).toBe(`${head}7s\n`);
    expect(render(stateOf(manifest, [started, ran]), 7000)).toEqual({ settled: `Execution E1\n${head}done (1.5s)\n`, live: "" });
    expect(render(stateOf(manifest, [started, ran, measuring]), 3500).live).toBe("      Measuring ... 2s\n");
    expect(render(stateOf(manifest, [started, ran, measuring, measured, done]), 7000)).toEqual({
      settled: `Execution E1\n${head}done (1.5s)\n      passed: true\n`,
      live: "",
    });
  });

  test("an agent that didn't end cleanly says how it ended, and measuring that failed leaves no line", () => {
    const log: RunEvent[] = [
      { type: "run", runId: "E1-1-1", step: "started", at: 0 },
      { type: "run", runId: "E1-1-1", step: "ran", record: recordOf({ exitCode: 2 }), at: 1500 },
      { type: "run", runId: "E1-1-1", step: "measuring", at: 1500 },
      { type: "run", runId: "E1-1-1", step: "measureFailed", reason: "no container", at: 1600 },
      { type: "run", runId: "E1-1-1", step: "done", at: 1600 },
    ];

    expect(render(stateOf(manifestOf(), log), 2000)).toEqual({ settled: "Execution E1\n 1/1  iteration 1/1  alpha | plain  ... exited 2 (1.5s)\n", live: "" });
  });

  test("an upload that ends after the next run started keeps its place under its own run", () => {
    const manifest = manifestOf({ iterations: 2, store: "registry/images" });
    const first = ranEvents("E1-1-1", 0);
    const uploading: RunEvent = { type: "run", runId: "E1-1-1", reference: "registry/images:postrun-1-1", step: "uploading", at: 1700 };
    const uploaded: RunEvent = { ...uploading, step: "uploaded", at: 9000 };
    const second = ranEvents("E1-1-2", 2000);
    const firstLines = " 1/1  iteration 1/2  alpha | plain  ... done (1.5s)\n      passed: true\n";
    const secondLines = " 1/1  iteration 2/2  alpha | plain  ... done (1.5s)\n      passed: true\n";

    // Its upload hasn't started: the next run's lines wait for it, as its line would go above them.
    expect(render(stateOf(manifest, [...first, ...second]), 5000)).toEqual({ settled: `Execution E1\n${firstLines}`, live: secondLines });

    expect(render(stateOf(manifest, [...first, ...second.slice(0, 1), uploading, ...second.slice(1)]), 5700)).toEqual({
      settled: `Execution E1\n${firstLines}`,
      live: `      Pushing registry/images:postrun-1-1 ... 4s\n${secondLines}`,
    });

    const whole = `Execution E1\n${firstLines}      Pushing registry/images:postrun-1-1 ... done\n${secondLines}`;
    expect(render(stateOf(manifest, [...first, ...second.slice(0, 1), uploading, ...second.slice(1), uploaded]), 9000).settled).toStartWith(whole);
    // Whenever the upload's events arrive, the lines are in the same order.
    expect(render(stateOf(manifest, [...first, uploading, uploaded, ...second]), 9000).settled).toStartWith(whole);
  });

  test("an upload that failed ends its line with failed", () => {
    const manifest = manifestOf({ store: "registry/images" });
    const upload: RunEvent = { type: "run", runId: "E1-1-1", reference: "registry/images:postrun-1-1", step: "uploading", at: 1700 };

    expect(render(stateOf(manifest, [...ranEvents("E1-1-1", 0), upload, { ...upload, step: "uploadFailed", at: 1800 }]), 2000).settled).toEndWith(
      "      passed: true\n      Pushing registry/images:postrun-1-1 ... failed\n",
    );
  });

  test("what's settled only grows as events arrive", () => {
    const manifest = manifestOf({ iterations: 2, store: "registry/images" });
    const upload = (runId: string, n: number, at: number): RunEvent[] => [
      { type: "run", runId, reference: `registry/images:postrun-1-${n}`, step: "uploading", at },
      { type: "run", runId, reference: `registry/images:postrun-1-${n}`, step: "uploaded", at: at + 100 },
    ];
    const log = [...ranEvents("E1-1-1", 0), ...ranEvents("E1-1-2", 2000), ...upload("E1-1-2", 2, 4000), ...upload("E1-1-1", 1, 5000)];

    let before = "";
    for (let length = 0; length <= log.length; length++) {
      const { settled } = render(stateOf(manifest, log.slice(0, length)), 6000);
      expect(settled).toStartWith(before);
      before = settled;
    }
    expect(render(stateOf(manifest, log), 6000).live).toBe("");
  });
});

describe("several at once", () => {
  const manifest = manifestOf({ harnesses: ["alpha", "beta"], concurrency: 2, store: "registry/images", runtime: { command: ["docker"] } });
  const alpha = " 1/2  iteration 1/1  alpha | plain";
  const beta = " 2/2  iteration 1/1  beta | plain";
  const header = "Execution E1\nRunning containers with `docker`\nUp to 2 containers at once\n";

  test("each thing that happens is a whole line, in the order it happened", () => {
    const log: RunEvent[] = [
      { type: "image", image: "prerun:alpha", step: "building", at: 0 },
      { type: "image", image: "prerun:beta", step: "building", at: 0 },
      { type: "image", image: "prerun:alpha", step: "built", at: 10 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pushing", at: 10 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pushed", at: 20 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pulling", at: 20 },
      { type: "image", image: "prerun:alpha", reference: "registry/images:alpha", step: "pulled", at: 30 },
      { type: "run", runId: "E1-1-1", step: "started", at: 30 },
      { type: "image", image: "prerun:beta", step: "built", at: 40 },
      { type: "run", runId: "E1-2-1", step: "started", at: 50 },
      { type: "run", runId: "E1-2-1", step: "ran", record: recordOf(), at: 1550 },
      { type: "run", runId: "E1-2-1", reference: "registry/images:postrun-2-1", step: "uploading", at: 1560 },
      { type: "run", runId: "E1-2-1", step: "measuring", at: 1560 },
      { type: "run", runId: "E1-2-1", reference: "registry/images:postrun-2-1", step: "uploaded", at: 1570 },
      { type: "run", runId: "E1-2-1", step: "measured", result: measures({ passed: false }), at: 1580 },
      { type: "run", runId: "E1-2-1", step: "done", at: 1580 },
    ];

    expect(render(stateOf(manifest, log), 4030)).toEqual({
      settled: [
        "Execution E1",
        "Running containers with `docker`",
        "Up to 2 containers at once",
        "Building prerun:alpha",
        "Building prerun:beta",
        "Built prerun:alpha",
        "Pushed registry/images:alpha",
        "Pulled registry/images:alpha into the runtime",
        `${alpha}  started`,
        "Built prerun:beta",
        `${beta}  started`,
        `${beta}  done (1.5s)`,
        `${beta}  pushed registry/images:postrun-2-1`,
        `${beta}  passed: false`,
        "",
      ].join("\n"),
      // The run still going.
      live: `${alpha}  running 4s\n`,
    });
  });

  test("each run still going has a live row, with its current step", () => {
    const log: RunEvent[] = [
      { type: "run", runId: "E1-1-1", step: "started", at: 0 },
      { type: "run", runId: "E1-2-1", step: "started", at: 0 },
      { type: "run", runId: "E1-1-1", step: "ran", record: recordOf(), at: 1500 },
      { type: "run", runId: "E1-1-1", step: "measuring", at: 2000 },
    ];

    expect(render(stateOf(manifest, log), 5000)).toEqual({
      settled: `${header}${alpha}  started\n${beta}  started\n${alpha}  done (1.5s)\n`,
      live: `${alpha}  done (1.5s)  measuring 3s\n${beta}  running 5s\n`,
    });
  });
});

describe("once the execution is recorded", () => {
  test("says where, relative to the working directory", () => {
    const state = stateOf(manifestOf(), ranEvents("E1-1-1", 0), { finished: finishedOf() });

    expect(render(state, 3000).settled).toEndWith("      passed: true\nRecorded in .data/runs.sqlite\n");
    expect(render(state, 3000).live).toBe("");
  });

  test("first says which agents didn't end cleanly, which postrun images hold a secret, and which couldn't be searched", () => {
    const manifest = manifestOf({ iterations: 3 });
    const ran = (runId: string, record: ContainerRunRecord): RunEvent[] => [
      { type: "run", runId, step: "started", at: 0 },
      { type: "run", runId, step: "ran", record, at: 1500 },
      { type: "run", runId, step: "done", at: 1500 },
    ];
    const log = [
      ...ran("E1-1-1", recordOf({ exitCode: 1 })),
      ...ran("E1-1-2", recordOf({}, { secretsFound: [{ name: "API_KEY", files: 1, paths: ["/notes.txt"] }] })),
      ...ran("E1-1-3", recordOf({}, { secretSearchFailed: "the image was too big" })),
    ];

    const { settled } = render(stateOf(manifest, log, { finished: finishedOf("Postgres at $DB") }), 3000);

    const footer = settled.split("\n").slice(4);
    expect(footer[0]).toBe("1 of 3 agents didn't end cleanly:");
    expect(footer[1]).toStartWith("  1×  exited 1");
    expect(footer[1]).toEndWith("(1-1)");
    expect(footer[2]).toBe("1 of 3 postrun images hold a secret's value in their files:");
    expect(footer[3]).toStartWith("  1-2  API_KEY  ");
    expect(footer[5]).toBe("Couldn't search 1 of 3 postrun images for secrets' values, so they may hold one:");
    expect(footer.slice(6)).toEqual(["  1-3  the image was too big", "Recorded in Postgres at $DB", ""]);
  });

  test("afterExecution's line comes last, then the timings once it has ended", () => {
    const manifest = manifestOf({ runtime: { command: ["docker"], afterExecution: ["shut", "down"] } });
    const timed = createRunRenderer({ paint: plain, cwd: "/work", showTimings: true });
    const running: RunEvent = { type: "hook", hook: "afterExecution", command: ["shut", "down"], step: "running", at: 3000 };
    const recorded = "Recorded in .data/runs.sqlite\n";

    expect(timed(stateOf(manifest, ranEvents("E1-1-1", 0), { finished: finishedOf() }), 3000).settled).toEndWith(recorded);

    const during = timed(stateOf(manifest, [...ranEvents("E1-1-1", 0), running], { finished: finishedOf() }), 5000);
    expect(during.settled).toEndWith(recorded);
    expect(during.live).toBe("Running the runtime's afterExecution, `shut down` ... 2s\n");

    const after = timed(stateOf(manifest, [...ranEvents("E1-1-1", 0), running, { ...running, step: "done", at: 6000 }], { finished: finishedOf() }), 6000);
    expect(after.settled).toEndWith(
      `${recorded}Running the runtime's afterExecution, \`shut down\` ... done\nTimings: 2.5s in all\n  running agents  1×  total 1.5s  longest 1.5s\n`,
    );
    expect(after.live).toBe("");
  });

  test("without an afterExecution, the timings follow where it's recorded", () => {
    const timed = createRunRenderer({ paint: plain, cwd: "/work", showTimings: true });

    expect(timed(stateOf(manifestOf(), [], { finished: finishedOf() }), 0).settled).toBe(
      "Execution E1\nRecorded in .data/runs.sqlite\nTimings: 2.5s in all\n  running agents  1×  total 1.5s  longest 1.5s\n",
    );
  });

  test("after only building, nothing is said of where it's recorded", () => {
    const log: RunEvent[] = [
      { type: "image", image: "prerun:alpha", step: "building", at: 0 },
      { type: "image", image: "prerun:alpha", step: "built", at: 10 },
    ];

    expect(render(stateOf(manifestOf(), log, { finished: finishedOf() }, "build-only"), 10).settled).toBe("Execution E1\nBuilding prerun:alpha ... done\n");
  });

  test("a step that never ended is left as it was, so what follows is settled", () => {
    const log: RunEvent[] = [{ type: "run", runId: "E1-1-1", step: "started", at: 0 }];

    expect(render(stateOf(manifestOf(), log, { finished: finishedOf() }), 3000)).toEqual({
      settled: "Execution E1\n 1/1  iteration 1/1  alpha | plain  ...\nRecorded in .data/runs.sqlite\n",
      live: "",
    });
  });

  test("being asked to stop has no line", () => {
    expect(render(stateOf(manifestOf(), [{ type: "stopping", signal: "SIGINT", at: 0 }]), 0)).toEqual({ settled: "Execution E1\n", live: "" });
  });
});

describe(runJson, () => {
  test("is nothing until the execution is recorded, then its record, where it's recorded and its container runs", () => {
    const manifest = manifestOf();
    const finished = { ...finishedOf(), containerRuns: [recordOf()] };

    expect(runJson(stateOf(manifest, ranEvents("E1-1-1", 0)))).toBeUndefined();
    expect(runJson(stateOf(manifest, ranEvents("E1-1-1", 0), { finished }))).toEqual({
      execution: finished.execution,
      recordedIn: "/work/.data/runs.sqlite",
      containerRuns: finished.containerRuns,
    });
  });
});
