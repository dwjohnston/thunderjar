// The canonical behaviour of `thunderjar run`. Maintained by humans: see HUMANS.md.
import { describe, expect, test } from "bun:test";
import { thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
const KEY = { FAKE_HARNESS_KEY: "fake-key" };

describe("0202 typical project", () => {
  test("two-harnesses: one permutation per fake harness, one iteration each", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:ded54607
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    env:      FAKE_HARNESS_KEY
    command:  sh /thunderjar/thunderjar-run.sh

Permutation 2: prerun image thunderjar-prerun:e4f0784f
  Iteration 1: postrun image thunderjar-postrun:<ULID>-2-1
    command:  sh /thunderjar/thunderjar-run.sh
`);
  });
});
