// Shared by run.test.ts and run.more.test.ts: `thunderjar run`'s tests, split in two so that
// `bun test --parallel` runs them in two workers.
import { expect } from "bun:test";
import { $, Glob } from "bun";
import { type ContainerRunRecord, type ExecutionRecord, type RecordedMeasure, type RecordedOutcome, sqliteStore, storeFileIn } from "../../../store/runDataStore.ts";
import { TMP_DIR } from "../../../testing/cli.ts";
import type { FakeDocker } from "../../../testing/fakeDocker.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
export const KEY = { FAKE_HARNESS_KEY: "fake-key" };

export const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
export const TERSE = "isPrime.ts: export a primality test.";
/** 0202's `awkward` initial prompt, full of shell syntax. */
export const AWKWARD = `Say "hello", then print $HOME and \`whoami\`.
Don't stop at 'single quotes', a backslash \\ or 100%.`;

/** 0201's fake-harness-alpha, which needs nothing. */
export const ALPHA_0201 = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"fake-model-small-001"}' > /thunderjar/result.json`;
/** 0202's fake agents record whether they saw FAKE_HARNESS_KEY. */
export const KEY_CHECK = ` && echo "\${FAKE_HARNESS_KEY+set}" > /thunderjar/fake-harness-key`;
/** What 0202's fake-harness-alpha writes: shaped like Claude Code's result. */
export const ALPHA_JSON =
  '{"type":"result","result":"Arr, isPrime.ts be written.","modelUsage":{"fake-model-small-001":{"inputTokens":12000,"outputTokens":400,"cacheReadInputTokens":80,"cacheCreationInputTokens":0,"costUSD":0.061,"costBasis":"list"}}}';
export const ALPHA_RESULT = `'${ALPHA_JSON}'`;
export const ALPHA = (prompt: string) => `${ALPHA_0201(prompt).replace(`'{"model":"fake-model-small-001"}'`, ALPHA_RESULT)}${KEY_CHECK}`;
export const BETA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}' > /thunderjar/result.json${KEY_CHECK}`;

/** The dry run's lines for permutation `n`, with its `iterations`, each given `env` and `prompt`, and running `command`. */
export const permutation = (n: number, hash: string, iterations: number, prompt: string, command: string, env?: string) =>
  [
    `Permutation ${n}: prerun image thunderjar-prerun:${hash}`,
    ...Array.from({ length: iterations }, (_, i) => [
      `  Iteration ${i + 1}: postrun image thunderjar-postrun:<ULID>-${n}-${i + 1}`,
      ...(env ? [`    env:      ${env}`] : []),
      `    prompt:   ${prompt}`,
      `    command:  ${command}`,
    ]).flat(),
  ].join("\n");

/** A permutation of 0202's fake-harness-alpha, given its key. */
export const alphaPermutation = (n: number, hash: string, iterations: number, prompt: string) =>
  permutation(n, hash, iterations, prompt, ALPHA(prompt), "FAKE_HARNESS_KEY");

export const filesIn = (dir: string) => [...new Glob("**").scanSync({ cwd: dir, dot: true })].sort();

export const dataDirs: string[] = [];
/** A fresh folder for `--data-dir`, removed after the test. */
export const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dataDirs.push(dir);
  return dir;
};


/** The execution record and container run records in the store under `dir`, for its one execution. */
export async function readStore(dir: string) {
  const store = sqliteStore(storeFileIn(dir));
  const [execution] = await store.listExecutions();
  return {
    files: filesIn(dir),
    execution: execution as ExecutionRecord,
    containerRuns: execution ? await store.containerRunsOf(execution.executionId) : [],
  };
}

/** The commands the fake Docker was given for containers, the script and `cp` destination elided. */
export const containerCommands = async (docker: FakeDocker) =>
  (await docker.commands())
    .filter((command) => !command.startsWith("docker image ls") && !command.startsWith("docker build"))
    .map((command) => command.replace(/ -c [\s\S]*$/, " -c <script>").replace(/^(docker cp \S+) .*$/, "$1 <destination>"));

export const ISO = expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
export const SHA = expect.stringMatching(/^[0-9a-f]{64}$/);

/** The measures line of a fake agent's container run, in 0202's is-prime task. */
export const ALPHA_MEASURES = "      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   saysArr: true   tsIgnoreCount: 1";
export const BETA_MEASURES = "      isPrimeTemplateTest: {passed: 5, failed: 0}   isPrimeTsExists: true   saysArr: false   tsIgnoreCount: 0";

/** A measure as recorded, taken by `instrument`, with `outcome`. */
export const measure = (instrument: string, outcome: RecordedOutcome): RecordedMeasure => ({ instrument, contentHash: SHA, measuredAt: ISO, outcome });
export const measured = (instrument: string, data: unknown) => measure(instrument, { outcome: "measured", data });
/** Removes the folders `dataDir` made: call after each test. */
export async function removeDataDirs() {
  for (const dir of dataDirs.splice(0)) await $`rm -rf ${dir}`.quiet();
}
