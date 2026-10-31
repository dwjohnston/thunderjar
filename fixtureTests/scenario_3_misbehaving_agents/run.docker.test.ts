// `thunderjar run` in a project whose agents misbehave: fake-harness-alpha 1.0.1 leaves a
// README.md and exits 3, and 1.0.2 runs past its initial prompt's timeout. Docker is real;
// skipped by `bun test`, run with `bun run test:prepare && bun run test:docker`. By hand:
//
//   bun run fixture scenario_3 run fails
//   bun run fixture scenario_3 run times-out

import { afterAll, describe, expect, test } from "bun:test";
import { containerRun, removeTestImages, runForReal, scenarioFixtures, tagsIn } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

describe.skipIf(!process.env.THUNDERJAR_TEST_DOCKER)("run misbehaving agents, against real Docker", () => {
  afterAll(removeTestImages);

  test("run fails: a failing cli's exit code is recorded, its runs are still measured, and the rest still run", async () => {
    const { output, prefix, store } = await runForReal(fixtures, "fails");

    // With no isPrime.ts and no .ts file at all, there is nothing to test or count.
    expect(output).toBe(`Execution <id> (2 permutations × 2 iterations)
Images in <prefix>
Build contexts in $TMPDIR/thunderjar/builds

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain
  prerun-h42440c48  built (<t>s)
  iteration 1/2  postrun-e<id>-h42440c48-i00  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped
  iteration 2/2  postrun-e<id>-h42440c48-i01  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped

Permutation 2/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  prerun-h8ffdda6e  built (<t>s)
  iteration 1/2  postrun-e<id>-h8ffdda6e-i00  exit 0  <t>s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1
  iteration 2/2  postrun-e<id>-h8ffdda6e-i01  exit 0  <t>s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1

4 container runs: 2 exited 0, 2 exited 3
Recorded in .thunderjar/.data/runs.json
`);

    // A failed run still leaves its postrun image.
    const workspaces = tagsIn(store).map((tag) => containerRun(prefix, tag).workspace);
    expect(workspaces).toEqual([["README.md"], ["README.md"], ["isPrime.ts"], ["isPrime.ts"]]);
    expect(store.containerRuns.map((r) => [r.harnessModel.version, r.execution.exitCode])).toEqual([
      ["1.0.1", 3],
      ["1.0.1", 3],
      ["1.0.0", 0],
      ["1.0.0", 0],
    ]);
  }, 300_000);

  test("run times-out: a cli that runs past the initial prompt's timeoutSeconds is killed, with exit code 124", async () => {
    const { output, prefix, store } = await runForReal(fixtures, "times-out");

    expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Images in <prefix>
Build contexts in $TMPDIR/thunderjar/builds

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.2/fake-model-small | impatient
  prerun-h389190d4  built (<t>s)
  iteration 1/2  postrun-e<id>-h389190d4-i00  exit 124  <t>s
  iteration 2/2  postrun-e<id>-h389190d4-i01  exit 124  <t>s

2 container runs: 2 exited 124
Recorded in .thunderjar/.data/runs.json
`);

    // Each is killed at about a second, well before `sleep 2` ends, so it never finishes.
    for (const tag of tagsIn(store)) {
      const { workspace, run } = containerRun(prefix, tag);
      expect(workspace).toEqual(["started.txt"]);
      expect(run.exitCode).toBe(124);
      expect(run.finishedAt - run.startedAt).toBeGreaterThanOrEqual(1000);
      expect(run.finishedAt - run.startedAt).toBeLessThan(1900);
    }
  }, 300_000);
});
