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

import { describe, expect, it } from "bun:test";
import { createDisplayerService } from "../../services/Displayer/Displayer.ts";
import { scenario } from "../../testing/scenario.ts";
import { renderRunState, runJson } from "./render.ts";
import { STOP_SETTLE_MS } from "./runControl.ts";
import { runCommand } from "./runCommand.ts";
import { type FakeDependencies, fakeAgent, fakeDependencies } from "./testSupport.ts";
import type { ExecutionResult, Manifest, RunOptions } from "./types.ts";

// Resolving a test case reads a real `.thunderjar/` folder: scenario 0202's `two-harnesses` has
// two permutations (harnesses alpha and beta) of one iteration. Everything Docker does is faked.
const CASE = "two-harnesses";
const KEY = { FAKE_HARNESS_KEY: "test-key" };

function fakesIn(id = "0202", agent = fakeAgent()): FakeDependencies {
  const fakes = fakeDependencies({ env: { cwd: scenario(id), variables: KEY } });
  fakes.runtimeDocker.on("", agent);
  return fakes;
}

/**
 * Waits for `command`, moving the fake clock on a second at a time meanwhile. Reading the project
 * takes real time, which the fake clock knows nothing of, so one big step wouldn't do.
 */
async function finish<T>(fakes: FakeDependencies, command: Promise<T>, until: () => boolean = () => false): Promise<void> {
  let done = false;
  const settled = () => {
    done = true;
  };
  command.then(settled, settled);
  while (!done && !until()) await fakes.clock.advance(1_000);
}

async function run(fakes: FakeDependencies, options: RunOptions = {}, name = CASE): Promise<number> {
  const command = runCommand(name, options, fakes.deps);
  await finish(fakes, command);
  return command;
}

const stateOf = (fakes: FakeDependencies) => fakes.state.get().run;

describe("runCommand: a full run", () => {
  it("builds, runs and records the execution, and exits 0", async () => {
    const fakes = fakesIn();

    const exitCode = await run(fakes);

    expect(exitCode).toBe(0);
    expect(fakes.runtimeDocker.builds.length).toBe(2);
    expect(fakes.store.executions.map(({ testCase, status }) => [testCase, status])).toEqual([[CASE, "complete"]]);
    expect(fakes.store.containerRuns.map(({ harnessModel }) => harnessModel.harness)).toEqual(["fake-harness-alpha", "fake-harness-beta"]);
    const state = stateOf(fakes);
    expect(Object.values(state.runs).map(({ status }) => status)).toEqual(["finished", "finished"]);
    expect(state.phase).toBe("done");
    expect(state.exitCode).toBe(0);
    expect(state.failure).toBeUndefined();
    expect(state.recordedIn).toBe("memory");
  });

  it("leaves what --json prints: the execution, where it was recorded and its container runs", async () => {
    const fakes = fakesIn();

    await run(fakes, { json: true });

    expect(fakes.displayer.mode).toBe("json");
    expect(stateOf(fakes).result).toEqual({
      execution: fakes.store.executions[0] as ExecutionResult["execution"],
      recordedIn: "memory",
      containerRuns: fakes.store.containerRuns,
    });
  });

  it("shows interactively unless --json is given, and sets how long it all took", async () => {
    const fakes = fakesIn();

    await run(fakes, { timings: true });

    expect(fakes.displayer.mode).toBe("interactive");
    expect(stateOf(fakes).manifest?.timings).toBe(true);
    expect(stateOf(fakes).timings?.wallMs).toBeGreaterThan(0);
    expect(stateOf(fakes).timings?.phases.agent?.count).toBe(2);
  });

  it("applies the overrides and the machine-level options", async () => {
    const fakes = fakesIn();

    await run(fakes, { iterations: 3, concurrency: 2, imagePrefix: "mine", dataDir: "elsewhere" });

    const manifest = stateOf(fakes).manifest as Manifest;
    expect(manifest.runs.length).toBe(6);
    expect(manifest.concurrency).toBe(2);
    expect(manifest.overrides).toEqual({ iterations: 3 });
    expect(manifest.images.every(({ image }) => image.startsWith("mine-prerun:"))).toBe(true);
    expect(fakes.stores.opened).toEqual(["elsewhere"]);
    expect(fakes.store.containerRuns.length).toBe(6);
  });

  it("exits 1 if an agent fails, with the execution recorded as failed", async () => {
    const fakes = fakesIn("0202", fakeAgent({ exitCode: 2, stderr: "out of credit" }));

    const exitCode = await run(fakes);

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).exitCode).toBe(1);
    expect(fakes.store.executions[0]?.status).toBe("failed");
    // Not an error: the execution ran, and says how in its notes.
    expect(stateOf(fakes).failure).toBeUndefined();
    expect(stateOf(fakes).notes?.[0]).toBe("2 of 2 agents didn't end cleanly:");
    expect((stateOf(fakes).result as ExecutionResult).execution.status).toBe("failed");
  });
});

describe("runCommand: a dry run", () => {
  it("plans and stops: nothing touches Docker or the store, and the manifest is the result", async () => {
    const fakes = fakesIn();

    const exitCode = await run(fakes, { dryRun: true });

    expect(exitCode).toBe(0);
    const { manifest, result, phase } = stateOf(fakes);
    expect(manifest?.testCase).toBe(CASE);
    expect(manifest?.permutations.map(({ harness }) => harness.name)).toEqual(["fake-harness-alpha", "fake-harness-beta"]);
    expect(result).toEqual({ manifest });
    expect(phase).toBe("planned");
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(fakes.runtimeDocker.calls).toEqual([]);
    expect(fakes.stores.opened).toEqual([]);
  });
});

describe("runCommand: build only", () => {
  it("builds the images and stops, with the manifest and each image's status as the result", async () => {
    const fakes = fakesIn();

    const exitCode = await run(fakes, { buildOnly: true });

    expect(exitCode).toBe(0);
    const { manifest, result, images } = stateOf(fakes);
    expect(Object.values(images)).toEqual(["ready", "ready"]);
    expect(result).toEqual({ manifest, images });
    expect(fakes.runtimeDocker.builds.map(({ image }) => image)).toEqual(manifest?.images.map(({ image }) => image) as string[]);
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
    expect(fakes.store.writes).toEqual([]);
  });
});

describe("runCommand: errors", () => {
  it("exits 1 with the problem as the failure, for a test case that isn't there", async () => {
    const fakes = fakesIn();

    const exitCode = await run(fakes, {}, "no-such-case");

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).failure).toContain("no-such-case");
    expect(stateOf(fakes).exitCode).toBe(1);
    expect(stateOf(fakes).result).toBeUndefined();
    expect(fakes.runtimeDocker.calls).toEqual([]);
  });

  it("exits 1 for options that can't go together, in the output format asked for", async () => {
    const fakes = fakesIn();

    const exitCode = await run(fakes, { dryRun: true, buildOnly: true, json: true });

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).failure).toContain("--dry-run and --build-only can't be given together");
    expect(fakes.displayer.mode).toBe("json");
  });

  it("exits 1 and says which image, if a build fails", async () => {
    const fakes = fakesIn();
    await run(fakes, { dryRun: true });
    const image = stateOf(fakes).manifest?.images[0]?.image as string;
    const again = fakesIn();
    again.runtimeDocker.failBuild(image, "no space left");

    const exitCode = await run(again);

    expect(exitCode).toBe(1);
    expect(stateOf(again).failure).toBe(`Building ${image} failed: no space left`);
    expect(stateOf(again).images[image]).toBe("failed");
  });

  it("exits 1 and says nothing was run, if the run data store can't be used", async () => {
    const fakes = fakesIn();
    fakes.store.failCheckWith("no such table");

    const exitCode = await run(fakes);

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).failure).toContain("Can't use the run data store, memory, so nothing was run: no such table");
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
  });

  it("says anything unexpected as it is, and never throws", async () => {
    const fakes = fakesIn();
    fakes.runtimeDocker.failOn("imagesIn", new Error("the daemon fell over"));

    const exitCode = await run(fakes);

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).failure).toBe("the daemon fell over");
  });
});

describe("runCommand: asked to stop", () => {
  const someRunning = (fakes: FakeDependencies) => Object.values(stateOf(fakes).runs).some(({ status }) => status === "running");

  /** Starts a run whose agents take a minute, and waits until one is running. */
  async function startSlowly(fakes: FakeDependencies, options: RunOptions = {}) {
    const command = runCommand(CASE, options, fakes.deps);
    await finish(fakes, command, () => someRunning(fakes));
    expect(someRunning(fakes)).toBe(true);
    // Wrapped: returning the promise itself would wait for it.
    return { command };
  }

  it("on Ctrl-C: removes the execution's containers, cancels what hadn't started, records it as failed and exits 130", async () => {
    const fakes = fakesIn("0202", fakeAgent({ durationMs: 60_000 }));
    const { command } = await startSlowly(fakes);

    fakes.io.interrupt();
    await finish(fakes, command);

    expect(await command).toBe(130);
    const { manifest, runs, failure, exitCode } = stateOf(fakes);
    expect(fakes.runtimeDocker.called("removeContainersNamed")[0]).toEqual([`thunderjar-run-${manifest?.executionId}-`]);
    expect(fakes.runtimeDocker.containers()).toEqual([]);
    expect(Object.values(runs).map(({ status }) => status)).toEqual(["crashed", "cancelled"]);
    expect(fakes.store.executions[0]?.status).toBe("failed");
    expect(failure).toBe(`Interrupted (SIGINT): stopped execution ${manifest?.executionId}'s containers.`);
    expect(exitCode).toBe(130);
  });

  it("on SIGTERM: exits 143", async () => {
    const fakes = fakesIn("0202", fakeAgent({ durationMs: 60_000 }));
    const { command } = await startSlowly(fakes);

    fakes.io.terminate();
    await finish(fakes, command);

    expect(await command).toBe(143);
    expect(stateOf(fakes).failure).toContain("Interrupted (SIGTERM)");
  });

  it("listens only while it runs: however it ends, nothing is left listening", async () => {
    const clean = fakeDependencies({ env: { cwd: scenario("0202"), variables: KEY } });
    const listening: number[] = [];
    clean.runtimeDocker.on("-1-1", fakeAgent()).on("-2-1", (context) => {
      listening.push(clean.io.stopListeners);
      return fakeAgent()(context);
    });
    await run(clean);
    expect(listening).toEqual([1]);
    expect(clean.io.stopListeners).toBe(0);

    const failing = fakesIn();
    await run(failing, {}, "no-such-case");
    expect(failing.io.stopListeners).toBe(0);

    const interrupted = fakesIn("0202", fakeAgent({ durationMs: 60_000 }));
    const { command } = await startSlowly(interrupted);
    interrupted.io.interrupt();
    await finish(interrupted, command);
    expect(interrupted.io.stopListeners).toBe(0);
  });

  const building = (fakes: FakeDependencies) => fakes.runtimeDocker.builds.length > 0;

  /** Starts a run whose builds take ten minutes each, and waits until the first is under way. */
  async function startBuilding(fakes: FakeDependencies, options: RunOptions = {}) {
    fakes.runtimeDocker.takes("build", 600_000);
    const command = runCommand(CASE, options, fakes.deps);
    await finish(fakes, command, () => building(fakes));
    expect(stateOf(fakes).phase).toBe("building");
    return { command };
  }

  it("while its images are built: builds no other, waits for the one under way no longer than the settle time, and exits 130", async () => {
    const fakes = fakesIn();
    const { command } = await startBuilding(fakes);

    const interruptedAt = fakes.clock.now();
    fakes.io.interrupt();
    await finish(fakes, command);

    expect(await command).toBe(130);
    expect(fakes.clock.now() - interruptedAt).toBeLessThanOrEqual(STOP_SETTLE_MS + 1_000);
    expect(fakes.runtimeDocker.builds.length).toBe(1);
    expect(fakes.runtimeDocker.called("run")).toEqual([]);
    expect(stateOf(fakes).failure).toBe("Interrupted (SIGINT): stopped before any container ran.");
  });

  it("with --build-only, the same", async () => {
    const fakes = fakesIn();
    const { command } = await startBuilding(fakes, { buildOnly: true });

    const interruptedAt = fakes.clock.now();
    fakes.io.terminate();
    await finish(fakes, command);

    expect(await command).toBe(143);
    expect(fakes.clock.now() - interruptedAt).toBeLessThanOrEqual(STOP_SETTLE_MS + 1_000);
    expect(fakes.runtimeDocker.builds.length).toBe(1);
  });

  it("asked a second time, stops waiting at once", async () => {
    const fakes = fakesIn();
    const { command } = await startBuilding(fakes);

    const interruptedAt = fakes.clock.now();
    fakes.io.interrupt();
    fakes.io.interrupt();

    // No time passes on the clock.
    expect(await command).toBe(130);
    expect(fakes.clock.now()).toBe(interruptedAt);
    expect(fakes.runtimeDocker.builds.length).toBe(1);
  });

  it("exits with the first signal's code, whatever the second was", async () => {
    const fakes = fakesIn();
    const { command } = await startBuilding(fakes);

    fakes.io.terminate();
    fakes.io.interrupt();

    expect(await command).toBe(143);
    expect(stateOf(fakes).failure).toContain("Interrupted (SIGTERM)");
  });

  it("while a run is measured, with every agent done: the execution is still recorded as failed", async () => {
    const fakes = fakesIn();
    const measure = fakes.measurer.measure.bind(fakes.measurer);
    fakes.measurer.measure = (...given) => {
      if (fakes.measurer.measured.length === 1) fakes.io.interrupt();
      return measure(...given);
    };

    const exitCode = await run(fakes);

    expect(exitCode).toBe(130);
    expect(Object.values(stateOf(fakes).runs).map(({ status }) => status)).toEqual(["finished", "finished"]);
    expect(fakes.store.executions[0]?.status).toBe("failed");
  });
});

describe("runCommand: a run data store that stops working", () => {
  it("exits 1 and says the execution stopped, and why", async () => {
    const fakes = fakeDependencies({ env: { cwd: scenario("0202"), variables: KEY } });
    fakes.runtimeDocker.on("", async (context) => {
      const exitCode = await fakeAgent()(context);
      fakes.store.failWith("disk full");
      return exitCode;
    });

    const exitCode = await run(fakes);

    expect(exitCode).toBe(1);
    expect(stateOf(fakes).failure).toContain("so the execution stopped: disk full");
    expect(fakes.runtimeDocker.called("run").length).toBe(1);
    expect(fakes.store.executions.map(({ status }) => status)).toEqual(["running"]);
  });
});

describe("runCommand: the variables a mode needs", () => {
  const withoutKey = () => {
    const fakes = fakeDependencies({ env: { cwd: scenario("0202"), variables: {} } });
    fakes.runtimeDocker.on("", fakeAgent());
    return fakes;
  };

  it("builds the images with --build-only without the harness's key: only a run uses it", async () => {
    const fakes = withoutKey();

    const exitCode = await run(fakes, { buildOnly: true });

    expect(exitCode).toBe(0);
    expect(fakes.runtimeDocker.builds.length).toBe(2);
  });

  it("still needs the key for a run, and for a dry run, which shows what a run would do", async () => {
    for (const options of [{}, { dryRun: true }]) {
      const fakes = withoutKey();

      const exitCode = await run(fakes, options);

      expect(exitCode).toBe(1);
      expect(stateOf(fakes).failure).toContain("needs FAKE_HARNESS_KEY, which is not set");
      expect(fakes.runtimeDocker.calls).toEqual([]);
    }
  });
});

describe("runCommand: what the real displayer makes of it", () => {
  /** Fakes whose displayer is the real one, drawing this folder's frame onto the fake streams. */
  function showing(): FakeDependencies {
    const fakes = fakesIn();
    const { state, clock, io } = fakes;
    fakes.deps.displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined, render: renderRunState, toJson: runJson });
    return fakes;
  }

  it("a dry run writes the plan, with each image's Dockerfile", async () => {
    const fakes = showing();

    await run(fakes, { dryRun: true });

    const image = stateOf(fakes).manifest?.images[0]?.image;
    expect(fakes.io.stdout.text()).toContain(`Execution ${stateOf(fakes).executionId}\n`);
    expect(fakes.io.stdout.text()).toContain(`# ${image}\nFROM `);
    expect(fakes.io.stderr.text()).toBe("");
  });

  it("a dry run with --json writes the manifest, and nothing else, to stdout", async () => {
    const fakes = showing();

    await run(fakes, { dryRun: true, json: true });

    expect(JSON.parse(fakes.io.stdout.text())).toEqual({ manifest: JSON.parse(JSON.stringify(stateOf(fakes).manifest)) });
  });

  it("a full run writes each run's line and where it was recorded", async () => {
    const fakes = showing();

    await run(fakes);

    const out = fakes.io.stdout.text();
    expect(out).toContain(" 1/2  iteration 1/1  fake-harness-alpha | ");
    expect(out).toContain("Runs: 2 finished\n");
    expect(out).toContain("Recorded in memory\n");
  });

  it("with --json, says on stderr why runs crashed: stdout is the JSON alone", async () => {
    const fakes = showing();
    fakes.runtimeDocker.failOn("commit", new Error("no space left on device"));

    const exitCode = await run(fakes, { json: true });

    expect(exitCode).toBe(1);
    expect((JSON.parse(fakes.io.stdout.text()) as ExecutionResult).execution.status).toBe("failed");
    expect(fakes.io.stderr.text()).toContain("2 of 2 agents didn't end cleanly:\n");
    expect(fakes.io.stderr.text()).toContain("crashed  no space left on device");
  });

  it("a config error is one Error line on stderr, and nothing on stdout", async () => {
    const fakes = showing();

    await run(fakes, {}, "no-such-case");

    expect(fakes.io.stdout.text()).toBe("");
    expect(fakes.io.stderr.text()).toStartWith("Error: ");
    expect(fakes.io.stderr.text().trimEnd().split("\n").length).toBe(1);
  });
});
