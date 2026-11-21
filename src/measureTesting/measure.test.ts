import { describe, expect, test } from "bun:test";
import { declareMeasurement } from "../api/declarations.ts";
import { measure } from "./measure.ts";

const FIXTURES = `${import.meta.dir}/fixtures`;

describe("measure", () => {
  test("shell: runs in the workspace, and scores the exit code by default", async () => {
    const declaration = declareMeasurement({
      instrument: "shell",
      config: { command: "test -f a.txt && grep -q hello a.txt" },
      metrics: { ok: { stat: "rate" } },
    });
    const good = await measure(declaration, { files: { "a.txt": `${FIXTURES}/hello.txt` } });
    expect(good).toMatchObject({ outcome: "measured", metrics: { ok: true } });
    expect((await measure(declaration, {})).metrics.ok).toBe(false);
  });
});
