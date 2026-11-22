// One-off migration for task 3851: harness model pairs now name every variant part, e.g.
// "codex-0.166.0/openai/gpt-6-luna" became "codex-0.166.0/openai/gpt-6-luna/medium". Rewrites the
// test cases in .thunderjar/ and the recorded runs to full names. Each harness's parts are its
// agent's documented default, hard-coded here: nothing else configures them.
//
//   bun scripts/migrations/fullPairNames.ts [--data-dir <dir>]
//
// Run from the repository, after the harnesses declare their models. It's safe to run again.

import { Glob } from "bun";
import { openStore } from "../../src/cli/dataDir.ts";
import { findThunderjarRoot } from "../../src/config/loader.ts";
import type { ContainerRunRecord } from "../../src/store/runDataStore.ts";

/** The parts appended to a pair, by the start of its harness folder: each agent's default effort. */
export const DEFAULT_PARTS: Record<string, string[]> = {
  // Codex's model_reasoning_effort defaults to medium.
  "codex-": ["medium"],
};

/** `pair`, with its harness's default parts appended, unless it has them already. */
export function migratePair(pair: string): string {
  const harness = pair.slice(0, pair.indexOf("/"));
  const parts = Object.entries(DEFAULT_PARTS).find(([prefix]) => harness.startsWith(prefix))?.[1];
  if (parts === undefined || pair.endsWith(`/${parts.join("/")}`)) return pair;
  return `${pair}/${parts.join("/")}`;
}

/** A test case's source, each quoted pair in it migrated. */
export function migrateSource(source: string): string {
  return source.replace(/(["'`])([a-z0-9][\w.-]*\/[^"'`\s]+)\1/g, (_match, quote: string, pair: string) => `${quote}${migratePair(pair)}${quote}`);
}

/** A recorded container run, its pair's name migrated. Any other record is returned as it is. */
export function migrateRun(record: ContainerRunRecord): ContainerRunRecord {
  const { harnessModel } = record.parameters;
  if (harnessModel === undefined) return record;
  return { ...record, parameters: { ...record.parameters, harnessModel: { ...harnessModel, name: migratePair(harnessModel.name) } } };
}

/** Migrates the test cases, and shared files they import, of the nearest `.thunderjar/`, and its recorded runs. */
async function main(argv: string[]): Promise<void> {
  const root = await findThunderjarRoot(process.cwd());
  let files = 0;
  for (const path of new Glob("{test-cases,shared}/**/*.ts").scanSync({ cwd: root })) {
    const file = Bun.file(`${root}/${path}`);
    const before = await file.text();
    const after = migrateSource(before);
    if (after !== before) {
      await Bun.write(file, after);
      files++;
    }
  }
  const dataDirAt = argv.indexOf("--data-dir");
  const { store, where } = await openStore(process.cwd(), dataDirAt === -1 ? undefined : argv[dataDirAt + 1], root);
  let runs = 0;
  for (const execution of await store.listExecutions()) {
    for (const run of await store.containerRunsOf(execution.executionId)) {
      const migrated = migrateRun(run);
      if (migrated.parameters.harnessModel?.name !== run.parameters.harnessModel?.name) {
        await store.recordContainerRun(migrated);
        runs++;
      }
    }
  }
  process.stdout.write(`Migrated ${files} files in ${root}, and ${runs} runs in ${where}.\n`);
}

if (import.meta.main) await main(process.argv.slice(2));
