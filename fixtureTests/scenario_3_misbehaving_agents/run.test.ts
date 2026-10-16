// `thunderjar run` in a project whose agents misbehave: fake-harness-alpha 1.0.1 leaves a
// README.md and exits 3, and 1.0.2 runs past its initial prompt's timeout. By hand:
//
//   bun run fixture scenario_3 run fails
//   bun run fixture scenario_3 run times-out

import { expect, test } from "bun:test";
import { containerRun, runForReal, scenarioFixtures, tagsIn } from "../helpers.ts";

const fixtures = scenarioFixtures(import.meta.dir);

test("run fails: a failing cli's exit code is recorded, its runs are still measured, and the rest still run", async () => {
  const { output, executionDir, store } = await runForReal(fixtures, "fails");

  // With no isPrime.ts and no .ts file at all, there is nothing to test or count.
  expect(output).toBe(`Execution <id> (2 permutations × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.1/fake-model-small | plain
  iteration 1/2  postrun-e<id>-h92e23284-i00  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped
  iteration 2/2  postrun-e<id>-h92e23284-i01  exit 3  <t>s
    isPrimeTemplateTest  skipped
    isPrimeTsExists      false
    readmeExists         true
    tsIgnoreCount        skipped

Permutation 2/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  iteration 1/2  postrun-e<id>-hd3d9e0f3-i00  exit 0  <t>s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1
  iteration 2/2  postrun-e<id>-hd3d9e0f3-i01  exit 0  <t>s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1

4 container runs: 2 exited 0, 2 exited 3
Recorded in .thunderjar/.data/runs.json
`);

  const workspaces = tagsIn(executionDir).map((tag) => containerRun(executionDir, tag).workspace);
  expect(workspaces.toSorted()).toEqual([["README.md"], ["README.md"], ["isPrime.ts"], ["isPrime.ts"]]);
  expect(store.containerRuns.map((r) => [r.harnessModel.version, r.execution.exitCode])).toEqual([
    ["1.0.1", 3],
    ["1.0.1", 3],
    ["1.0.0", 0],
    ["1.0.0", 0],
  ]);
});

test("run times-out: a cli that runs past the initial prompt's timeoutSeconds is killed, with exit code 124", async () => {
  const startedAt = Date.now();
  const { output, executionDir } = await runForReal(fixtures, "times-out");
  // Each of the two iterations is killed at about a second, well before `sleep 2` ends.
  expect(Date.now() - startedAt).toBeLessThan(3500);

  expect(output).toBe(`Execution <id> (1 permutation × 2 iterations)
Output in $TMPDIR/thunderjar/<id>

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.2/fake-model-small | impatient
  iteration 1/2  postrun-e<id>-h26875491-i00  exit 124  <t>s
  iteration 2/2  postrun-e<id>-h26875491-i01  exit 124  <t>s

2 container runs: 2 exited 124
Recorded in .thunderjar/.data/runs.json
`);

  await Bun.sleep(1500); // past when `sleep 2` would have finished
  for (const tag of tagsIn(executionDir)) {
    const { workspace, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["started.txt"]);
    expect(run.exitCode).toBe(124);
    expect(run.finishedAt - run.startedAt).toBeGreaterThanOrEqual(1000);
    expect(run.finishedAt - run.startedAt).toBeLessThan(1900);
  }
});
