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
import { FakeApplicationState } from "../../services/ApplicationState/FakeApplicationState.ts";
import { FakeClock } from "../../services/Clock/FakeClock.ts";
import { timed } from "./timed.ts";
import type { Manifest } from "./types.ts";

describe("timed", () => {
  it("returns what the job returns, and adds how long it took on the clock to the phase", async () => {
    const deps = { clock: new FakeClock(), state: new FakeApplicationState<Manifest>() };

    const first = timed(deps, "bake", async () => {
      await deps.clock.sleep(300);
      return "bread";
    });
    await deps.clock.advance(300);
    const second = timed(deps, "bake", () => deps.clock.sleep(100));
    await deps.clock.advance(100);
    await second;

    expect(await first).toBe("bread");
    expect(deps.state.get().run.timings?.phases).toEqual({ bake: { count: 2, totalMs: 400, maxMs: 300 } });
  });

  it("times a job that throws too, and lets its error through", async () => {
    const deps = { clock: new FakeClock(), state: new FakeApplicationState<Manifest>() };

    const failing = timed(deps, "bake", async () => {
      await deps.clock.sleep(50);
      throw new Error("burnt");
    });
    const failure = failing.catch((error: unknown) => error);
    await deps.clock.advance(50);

    expect(((await failure) as Error).message).toBe("burnt");
    expect(deps.state.get().run.timings?.phases.bake).toEqual({ count: 1, totalMs: 50, maxMs: 50 });
  });
});
