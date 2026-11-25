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

import { describe, expect, test } from "bun:test";
import { emptyRunState, type RunProgress, type RunState } from "../../services/ApplicationState/ApplicationState.ts";
import { displayPath, duration, EXPOSED, notesOf, ordinal, renderRunState, runJson, showSecrets, showTimings, showUnclean, showUnsearched } from "./render.ts";
import { aManifest, AN_IMAGE_STORE, aPermutation, EXECUTION_ID, START_TIME } from "./testSupport.ts";
import type { Manifest, RunRecord } from "./types.ts";

// aManifest(): permutations `a` (says hello) and `b` (says hi), two iterations each.
const RUN = {
  a1: `${EXECUTION_ID}-aaaaaaaa-i1`,
  a2: `${EXECUTION_ID}-aaaaaaaa-i2`,
  b1: `${EXECUTION_ID}-bbbbbbbb-i1`,
  b2: `${EXECUTION_ID}-bbbbbbbb-i2`,
};

const stateOf = (manifest: Manifest, rest: Partial<RunState<Manifest>> = {}): RunState<Manifest> => ({ ...emptyRunState<Manifest>(), manifest, ...rest });

/** The frame's lines. */
const linesOf = (state: RunState<Manifest>, now = START_TIME) => renderRunState(state, now).split("\n");

/** The line of the run of `permutation` and `iteration`, e.g. `1/2  iteration 1/2`. */
const runLine = (state: RunState<Manifest>, head: string, now = START_TIME) => linesOf(state, now).find((line) => line.startsWith(` ${head}`));

const withRuns = (runs: Record<string, RunProgress>, rest: Partial<RunState<Manifest>> = {}) => stateOf(aManifest(), { phase: "running", runs, ...rest });

describe("renderRunState: before there is a manifest", () => {
  test("is empty", () => {
    expect(renderRunState(emptyRunState<Manifest>(), START_TIME)).toBe("");
    expect(renderRunState({ ...emptyRunState<Manifest>(), failure: "no such test case" }, START_TIME)).toBe("");
  });
});

describe("renderRunState: the test case", () => {
  test("starts with the execution's ID", () => {
    expect(linesOf(stateOf(aManifest()))[0]).toBe(`Execution ${EXECUTION_ID}`);
  });

  test("lists the parameters of each axis, each name once, and the task", () => {
    const lines = linesOf(stateOf(aManifest()));

    expect(lines).toContain("baseImage:     node");
    expect(lines).toContain("codeState:     empty");
    expect(lines).toContain("promptSet:     none");
    expect(lines).toContain("harnessModel:  robot/small");
    expect(lines).toContain("task:          greet");
    expect(lines).toContain("initialPrompt: hello, hi");
  });

  test("shows the test case's env with its values, its secrets by name, and the overrides as flags, when there are any", () => {
    const plain = renderRunState(stateOf(aManifest()), START_TIME);
    expect(plain).not.toContain("env:");
    expect(plain).not.toContain("overrides:");

    const lines = linesOf(stateOf(aManifest({ env: { GREETING: "hello there" }, secretEnv: ["NPM_TOKEN"], overrides: { iterations: 2 } })));
    expect(lines).toContain('env:           GREETING="hello there"');
    expect(lines).toContain("secretEnv:     NPM_TOKEN");
    expect(lines).toContain("overrides:     --iterations 2");
  });

  test("shows the matrix's shape and each permutation with its abbreviated hash", () => {
    const lines = linesOf(stateOf(aManifest()));

    expect(lines).toContain("Matrix shape: 1/1/1/1/2 (2 permutations)");
    expect(lines).toContain(" 1  node | empty | none | robot/small | hello   aaaaaaaa");
    expect(lines).toContain(" 2  node | empty | none | robot/small | hi      bbbbbbbb");
  });

  test("says one permutation in the singular", () => {
    const one = aManifest({}, { permutations: [aPermutation("a")] });
    expect(renderRunState(stateOf(one), START_TIME)).toContain("(1 permutation)");
  });

  test("shows what each parameter with a resolve resolved to", () => {
    const manifest = aManifest({}, { permutations: [aPermutation("a", { resolved: { codeState: "abc123", promptSet: { ref: "main" } } })] });
    const lines = linesOf(stateOf(manifest));

    expect(lines).toContain("Resolved");
    expect(lines).toContain("  codeState  empty  abc123");
    expect(lines).toContain('  promptSet  none   {"ref":"main"}');
    expect(renderRunState(stateOf(aManifest()), START_TIME)).not.toContain("Resolved");
  });

  test("ends in one newline, its parts a blank line apart", () => {
    const frame = renderRunState(stateOf(aManifest()), START_TIME);
    expect(frame.endsWith("\n")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(false);
    expect(frame).toContain(`Execution ${EXECUTION_ID}\n\nbaseImage:`);
    expect(frame).not.toContain("\n\n\n");
  });
});

describe("renderRunState: where it runs", () => {
  const RUNTIME = { command: ["docker", "--context", "cloud"], concurrency: 4, beforeExecution: ["./up.sh", "big"], afterExecution: ["./down.sh"] };

  test("says nothing for one container at a time on the local Docker daemon", () => {
    const frame = renderRunState(stateOf(aManifest()), START_TIME);

    expect(frame).not.toContain("at once");
    expect(frame).not.toContain("runtime");
  });

  test("says how many containers run at once, and how many images build at once, when it's more than one", () => {
    const lines = linesOf(stateOf(aManifest({ concurrency: 3, buildConcurrency: 2 })));

    expect(lines).toContain("Up to 3 containers at once");
    expect(lines).toContain("Building up to 2 prerun images at once");
  });

  test("says containers run on the runtime, with its hooks, and where images are stored", () => {
    const lines = linesOf(stateOf(aManifest({ concurrency: 4 }, { imageStore: AN_IMAGE_STORE, runtime: RUNTIME })));

    expect(lines).toContain("Containers run on the runtime, up to 4 at once");
    expect(lines).toContain(`Images are pushed to ${AN_IMAGE_STORE.repository}`);
    expect(lines).toContain("Before the execution: ./up.sh big");
    expect(lines).toContain("After the execution:  ./down.sh");
  });
});

describe("renderRunState: a dry run", () => {
  const dryRun = (manifest = aManifest()) => stateOf(manifest, { phase: "planned" });

  test("shows each permutation's prerun image and each iteration's postrun image, env, docker options and command", () => {
    const frame = renderRunState(dryRun(aManifest({ env: { GREETING: "hello" }, secretEnv: ["NPM_TOKEN"] })), START_TIME);

    expect(frame).toContain(
      [
        "Permutation 1: prerun image thunderjar-prerun:AAAAAAAA",
        `  Iteration 1: postrun image thunderjar-postrun:${EXECUTION_ID}-1-1`,
        "    env:      ROBOT_KEY, NPM_TOKEN, GREETING=hello",
        "    docker:   --init",
        "    command:  sh /thunderjar/thunderjar-run.sh",
        `  Iteration 2: postrun image thunderjar-postrun:${EXECUTION_ID}-1-2`,
      ].join("\n"),
    );
    expect(frame).toContain("Permutation 2: prerun image thunderjar-prerun:BBBBBBBB");
  });

  test("leaves out env and docker options a permutation doesn't have", () => {
    const bare = aManifest({}, { permutations: [aPermutation("a", {}, { harnessEnv: [], runOptions: [] })] });
    const frame = renderRunState(dryRun(bare), START_TIME);

    expect(frame).not.toContain("    env:");
    expect(frame).not.toContain("    docker:");
    expect(frame).toContain("    command:  sh /thunderjar/thunderjar-run.sh");
  });

  test("with an image store, shows where each postrun image and each prerun image is stored", () => {
    const stored = aManifest({}, { imageStore: AN_IMAGE_STORE });
    const frame = renderRunState(dryRun(stored), START_TIME);

    expect(frame).toContain(`  Iteration 1: postrun image thunderjar-postrun:${EXECUTION_ID}-1-1\n    stored:   ${stored.runs[0]?.storedPostrunImage}\n`);
    expect(frame).toContain(`# thunderjar-prerun:AAAAAAAA\n# stored as ${stored.images[0]?.stored}\nFROM node\n`);
  });

  test("shows each prerun image's Dockerfile under its name", () => {
    const frame = renderRunState(dryRun(), START_TIME);

    expect(frame).toContain("# thunderjar-prerun:AAAAAAAA\nFROM node\n# a\n\n# thunderjar-prerun:BBBBBBBB\nFROM node\n# b\n");
  });

  test("shows neither once the command has moved past the plan", () => {
    const frame = renderRunState(stateOf(aManifest(), { phase: "building" }), START_TIME);

    expect(frame).not.toContain("Permutation 1:");
    expect(frame).not.toContain("FROM node");
  });
});

describe("renderRunState: images", () => {
  test("shows each image and where it has got to, while they're built", () => {
    const state = stateOf(aManifest(), { phase: "building", images: { "thunderjar-prerun:AAAAAAAA": "ready", "thunderjar-prerun:BBBBBBBB": "building" } });
    const frame = renderRunState(state, START_TIME);

    expect(frame).toContain("Images:\n  thunderjar-prerun:AAAAAAAA  ready\n  thunderjar-prerun:BBBBBBBB  building\n");
  });

  test("still shows them after a build-only run, when there are no runs", () => {
    const state = stateOf(aManifest(), { phase: "done", images: { "thunderjar-prerun:AAAAAAAA": "ready" } });
    expect(renderRunState(state, START_TIME)).toContain("  thunderjar-prerun:AAAAAAAA  ready");
  });

  test("drops them once runs are under way and all are ready, but not one that failed", () => {
    const ready = withRuns({ [RUN.a1]: { status: "queued" } }, { images: { "thunderjar-prerun:AAAAAAAA": "ready" } });
    expect(renderRunState(ready, START_TIME)).not.toContain("Images:");

    const failed = withRuns({ [RUN.a1]: { status: "queued" } }, { images: { "thunderjar-prerun:AAAAAAAA": "failed" } });
    expect(renderRunState(failed, START_TIME)).toContain("  thunderjar-prerun:AAAAAAAA  failed");
  });
});

describe("renderRunState: runs", () => {
  test("has a line for each run the state knows, in plan order, labelled by what tells its permutation apart", () => {
    const state = withRuns({ [RUN.b2]: { status: "queued" }, [RUN.a1]: { status: "queued" } });
    const runs = linesOf(state).filter((line) => line.includes("iteration"));

    expect(runs).toEqual([" 1/2  iteration 1/2  robot | hello  queued", " 2/2  iteration 2/2  robot | hi  queued"]);
  });

  test("labels with every axis that varies, and the whole pair when two share a harness", () => {
    const manifest = aManifest(
      {},
      {
        permutations: [
          aPermutation("a", { codeState: "empty", harnessModel: "robot/small" }),
          aPermutation("b", { codeState: "full", harnessModel: "robot/large" }, { harness: { name: "robot", version: "1.0.0", modelId: "large" } }),
        ],
      },
    );
    const state = stateOf(manifest, { phase: "running", runs: { [RUN.a1]: { status: "queued" }, [RUN.b1]: { status: "queued" } } });

    expect(runLine(state, "1/2  iteration 1/2")).toBe(" 1/2  iteration 1/2  empty | robot/small | hello  queued");
    expect(runLine(state, "2/2  iteration 1/2")).toBe(" 2/2  iteration 1/2  full | robot/large | hello  queued");
  });

  test("counts a running run's seconds from the time given", () => {
    const state = withRuns({ [RUN.a1]: { status: "running", startedAt: START_TIME } });

    expect(runLine(state, "1/2  iteration 1/2", START_TIME + 12_400)).toBe(" 1/2  iteration 1/2  robot | hello  running (12s)");
    expect(runLine(state, "1/2  iteration 1/2", START_TIME + 13_000)).toBe(" 1/2  iteration 1/2  robot | hello  running (13s)");
  });

  test("shows where a run is between its agent ending and its measures", () => {
    for (const status of ["committing", "committed", "measuring"] as const) {
      expect(runLine(withRuns({ [RUN.a1]: { status, startedAt: START_TIME } }), "1/2  iteration 1/2")).toBe(` 1/2  iteration 1/2  robot | hello  ${status}`);
    }
  });

  test("shows how a finished run ended, how long it took and what it cost", () => {
    const ended = { status: "finished", outcome: "done", startedAt: START_TIME, finishedAt: START_TIME + 12_300 } as const;

    expect(runLine(withRuns({ [RUN.a1]: { ...ended, costUsd: 0.0612, tokens: 12_480 } }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  done (12.3s, $0.061)");
    expect(runLine(withRuns({ [RUN.a1]: { ...ended, tokens: 12_480 } }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  done (12.3s, 12,480 tokens)");
    expect(runLine(withRuns({ [RUN.a1]: ended }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  done (12.3s)");
    expect(runLine(withRuns({ [RUN.a1]: { ...ended, outcome: "exited 2", finishedAt: START_TIME + 850 } }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  exited 2 (850ms)");
  });

  test("shows a run's measures under it, lined up with its iteration", () => {
    const state = withRuns({
      [RUN.a1]: { status: "finished", outcome: "done", startedAt: START_TIME, finishedAt: START_TIME + 1_000, measures: { polite: "true", tests: "{passed: 4, failed: 1}" } },
    });
    const lines = linesOf(state);
    const at = lines.findIndex((line) => line.startsWith(" 1/2  iteration 1/2"));

    expect(lines[at + 1]).toBe("      polite: true   tests: {passed: 4, failed: 1}");
  });

  test("says when a finished run's image is uploading, and uploaded", () => {
    const ended = { outcome: "done", startedAt: START_TIME, finishedAt: START_TIME + 2_000 };

    expect(runLine(withRuns({ [RUN.a1]: { ...ended, status: "uploading" } }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  done (2.0s)  uploading");
    expect(runLine(withRuns({ [RUN.a1]: { ...ended, status: "uploaded" } }), "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  done (2.0s)  uploaded");
  });

  test("shows a timeout as its outcome alone, which says how long", () => {
    const state = withRuns({ [RUN.a1]: { status: "timedOut", outcome: "timed out after 60s", startedAt: START_TIME, finishedAt: START_TIME + 60_000 } });

    expect(runLine(state, "1/2")).toBe(" 1/2  iteration 1/2  robot | hello  timed out after 60s");
  });

  test("shows why a run crashed, and a cancelled one as that", () => {
    const state = withRuns({
      [RUN.a1]: { status: "crashed", error: "docker run exited 137" },
      [RUN.a2]: { status: "crashed", outcome: "failed to start", error: "No such image: box" },
      [RUN.b1]: { status: "cancelled" },
    });

    expect(runLine(state, "1/2  iteration 1/2")).toBe(" 1/2  iteration 1/2  robot | hello  crashed: docker run exited 137");
    expect(runLine(state, "1/2  iteration 2/2")).toBe(" 1/2  iteration 2/2  robot | hello  failed to start: No such image: box");
    expect(runLine(state, "2/2  iteration 1/2")).toBe(" 2/2  iteration 1/2  robot | hi  cancelled");
  });

  test("counts the runs in each status, in lifecycle order", () => {
    const state = withRuns({ [RUN.a1]: { status: "finished" }, [RUN.a2]: { status: "running" }, [RUN.b1]: { status: "queued" }, [RUN.b2]: { status: "queued" } });

    expect(linesOf(state)).toContain("Runs: 2 queued, 1 running, 1 finished");
  });

  test("shows the upload backlog only when something is waiting", () => {
    const runs = { [RUN.a1]: { status: "finished" } } as const;

    expect(linesOf(withRuns(runs, { uploadBacklog: 3 }))).toContain("Upload backlog: 3");
    expect(renderRunState(withRuns(runs), START_TIME)).not.toContain("Upload backlog");
  });

  test("has no runs part before any run is known", () => {
    expect(renderRunState(stateOf(aManifest(), { phase: "building" }), START_TIME)).not.toContain("Runs:");
  });
});

describe("renderRunState: once it's over", () => {
  test("shows the notes, then where it was recorded", () => {
    const state = withRuns({ [RUN.a1]: { status: "finished" } }, { phase: "done", notes: ["1 of 4 agents didn't end cleanly:", "  1×  exited 2  (1-2)"], recordedIn: "data/runs.sqlite" });
    const frame = renderRunState(state, START_TIME);

    expect(frame).toContain("1 of 4 agents didn't end cleanly:\n  1×  exited 2  (1-2)\n\nRecorded in data/runs.sqlite\n");
  });

  test("shows the timings only if the manifest asks, and only at the end", () => {
    const timings = { wallMs: 65_000, phases: { agent: { count: 4, totalMs: 4_000, maxMs: 1_000 } } };
    const asked = aManifest({ timings: true });

    expect(renderRunState(stateOf(asked, { phase: "done", timings }), START_TIME)).toContain("Timings: 65.0s in all\n  running agents  4×  total 4.0s  longest 1.0s\n");
    expect(renderRunState(stateOf(asked, { phase: "running", timings }), START_TIME)).not.toContain("Timings");
    expect(renderRunState(stateOf(aManifest(), { phase: "done", timings }), START_TIME)).not.toContain("Timings");
  });

  test("leaves warnings and the failure to the displayer, which writes them to stderr", () => {
    const frame = renderRunState(stateOf(aManifest(), { warnings: ["an old setting"], failure: "it broke" }), START_TIME);

    expect(frame).not.toContain("an old setting");
    expect(frame).not.toContain("it broke");
  });
});

describe(showTimings, () => {
  test("lists the phases in the order they happen, whatever order they were recorded in, in columns", () => {
    const lines = showTimings({
      wallMs: 850,
      phases: { measure: { count: 12, totalMs: 300, maxMs: 40 }, build: { count: 2, totalMs: 20_000, maxMs: 15_000 }, somethingNew: { count: 1, totalMs: 1, maxMs: 1 } },
    });

    expect(lines).toEqual([
      "Timings: 850ms in all",
      "  building prerun images   2×  total 20.0s  longest 15.0s",
      "  measuring               12×  total 300ms  longest 40ms",
      "  somethingNew             1×  total 1ms    longest 1ms",
    ]);
  });
});

describe(showUnclean, () => {
  test("says nothing when every agent ended cleanly", () => {
    expect(showUnclean([], 4)).toEqual([]);
  });

  test("groups the runs by how they ended and why, most first, naming at most eight", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ run: `1-${index + 1}`, end: "exited 1", why: "out of credit" }));
    const lines = showUnclean([{ run: "2-1", end: "timed out after 60s" }, ...many], 12);

    expect(lines).toEqual([
      "11 of 12 agents didn't end cleanly:",
      "  10×  exited 1  out of credit  (1-1, 1-2, 1-3, 1-4, 1-5, 1-6, 1-7, 1-8, …)",
      "   1×  timed out after 60s  (2-1)",
    ]);
  });
});

describe(showSecrets, () => {
  test("says nothing when none was found", () => {
    expect(showSecrets([], 4)).toEqual([]);
  });

  test("counts the images, lists each secret by name with its files, and says they're exposed", () => {
    const lines = showSecrets(
      [
        { run: "1-1", name: "KEY", files: 1, paths: ["/workspace/.env"] },
        { run: "1-1", name: "NPM_TOKEN", files: 5, paths: ["/a", "/b", "/c", "/d", "/e"] },
        { run: "2-1", name: "KEY", files: 2, paths: ["/a", "/b"] },
      ],
      4,
    );

    expect(lines).toEqual([
      "2 of 4 postrun images hold a secret's value in their files:",
      "  1-1  KEY        1 file: /workspace/.env",
      "  1-1  NPM_TOKEN  5 files: /a, /b, /c, …",
      "  2-1  KEY        2 files: /a, /b",
      EXPOSED,
    ]);
  });
});

describe(showUnsearched, () => {
  test("lists each image that couldn't be searched, and why", () => {
    expect(showUnsearched([], 4)).toEqual([]);
    expect(showUnsearched([{ run: "1-2", reason: "the search timed out" }], 4)).toEqual([
      "Couldn't search 1 of 4 postrun images for secrets' values, so they may hold one:",
      "  1-2  the search timed out",
    ]);
  });
});

describe(notesOf, () => {
  test("says nothing of runs that were cancelled, or that ended cleanly", () => {
    const runs: RunRecord[] = [
      { runId: RUN.a1, status: "cancelled" },
      { runId: RUN.a2, status: "cancelled" },
    ];
    expect(notesOf(aManifest(), runs)).toEqual([]);
  });

  test("names a run that crashed with nothing recorded by its permutation and iteration", () => {
    expect(notesOf(aManifest(), [{ runId: RUN.b2, status: "crashed", error: "docker run exited 137" }])).toEqual([
      "1 of 4 agents didn't end cleanly:",
      "  1×  crashed  docker run exited 137  (2-2)",
    ]);
  });
});

describe(runJson, () => {
  test("is the result, once there is one", () => {
    const manifest = aManifest();
    expect(runJson(stateOf(manifest, { result: { manifest } }))).toEqual({ manifest });
    // Even if something failed after it.
    expect(runJson(stateOf(manifest, { result: { manifest }, failure: "afterExecution failed" }))).toEqual({ manifest });
  });

  test("is the failure, if the command stopped before it had a result", () => {
    expect(runJson({ ...emptyRunState<Manifest>(), failure: "no such test case" })).toEqual({ failure: "no such test case" });
  });

  test("is null with neither", () => {
    expect(runJson(emptyRunState<Manifest>())).toBeNull();
  });
});

describe("the small formats", () => {
  test("ordinal pads to the total's width", () => {
    expect(ordinal(3, 12)).toBe(" 3/12");
    expect(ordinal(3, 4)).toBe("3/4");
  });

  test("duration is milliseconds under a second, then seconds to one place", () => {
    expect(duration(850)).toBe("850ms");
    expect(duration(12_340)).toBe("12.3s");
  });

  test("displayPath shows a path inside the folder from it, any other in full", () => {
    expect(displayPath("/project", "/project/data/runs.sqlite")).toBe("data/runs.sqlite");
    expect(displayPath("/project", "/elsewhere/runs.sqlite")).toBe("/elsewhere/runs.sqlite");
    expect(displayPath("/project", "Postgres at $DB_URL")).toBe("Postgres at $DB_URL");
  });
});
