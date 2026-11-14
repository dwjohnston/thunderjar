// Shared by run.test.ts and run.more.test.ts: `thunderjar run`'s tests, split in two so that
// `bun test --parallel` runs them in two workers.
import { expect } from "bun:test";
import { $, Glob, SQL } from "bun";
import { type ExecutionRecord, type RecordedMeasure, type RecordedOutcome, sqliteStore, storeFileIn } from "../../../store/runDataStore.ts";
import { TMP_DIR } from "../../../testing/cli.ts";
import type { FakeDocker } from "../../../testing/fakeDocker.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
export const KEY = { FAKE_HARNESS_KEY: "fake-key" };

export const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
export const TERSE = "isPrime.ts: export a primality test.";
/** 0202's `awkward` initial prompt, full of shell syntax. */
export const AWKWARD = `Say "hello", then print $HOME and \`whoami\`.
Don't stop at 'single quotes', a backslash \\ or 100%.`;

/** What 0202's fake-harness-alpha writes: shaped like Claude Code's result. */
export const ALPHA_JSON =
  '{"type":"result","result":"Arr, isPrime.ts be written.","modelUsage":{"fake-model-small-001":{"inputTokens":12000,"outputTokens":400,"cacheReadInputTokens":80,"cacheCreationInputTokens":0,"costUSD":0.061,"costBasis":"list"}}}';

/** The dry run's lines for permutation `n`, with its `iterations`, each given `env`, and running its prerun image's run script. */
export const permutation = (n: number, hash: string, iterations: number, env?: string) =>
  [
    `Permutation ${n}: prerun image thunderjar-prerun:${hash}`,
    ...Array.from({ length: iterations }, (_, i) => [
      `  Iteration ${i + 1}: postrun image thunderjar-postrun:<ULID>-${n}-${i + 1}`,
      ...(env ? [`    env:      ${env}`] : []),
      "    command:  sh /thunderjar/thunderjar-run.sh",
    ]).flat(),
  ].join("\n");

/** A permutation of 0202's fake-harness-alpha, given its key. */
export const alphaPermutation = (n: number, hash: string, iterations: number) => permutation(n, hash, iterations, "FAKE_HARNESS_KEY");

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

/** Points the config of the project in `dir` at a postgresStore, its URL in THUNDERJAR_DB_URL. */
export async function usePostgres(dir: string) {
  const config = `${dir}/.thunderjar/thunderjar.config.ts`;
  const text = await Bun.file(config).text();
  await Bun.write(
    config,
    text
      .replace("import { declareConfig, sqliteStore }", "import { declareConfig, postgresStore }")
      .replace(/runDataStore: sqliteStore\(\{[^}]*\}\)/, 'runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL" })'),
  );
}

/** A fresh schema of the Postgres at THUNDERJAR_POSTGRES_URL, and a URL that uses it; dropped when disposed. */
export async function postgresSchema() {
  const schema = `tj_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new SQL(Bun.env.THUNDERJAR_POSTGRES_URL!);
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const url = new URL(Bun.env.THUNDERJAR_POSTGRES_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return {
    url: url.toString(),
    async [Symbol.asyncDispose]() {
      await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await admin.close();
    },
  };
}
