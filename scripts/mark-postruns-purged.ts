#!/usr/bin/env bun
/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// A one-off: marks container runs' postrun images as purged in the run data store, after they were
// deleted by hand, so their records say why the images they name are gone. Their measures stay.
// Run it in the project, which finds the store its config names, or give --data-dir:
//
//   bun scripts/mark-postruns-purged.ts --from imageStore --reason "held leaked keys" <execution ID>…
//   bun scripts/mark-postruns-purged.ts --from both --all --dry-run
//
// --from is where the images were deleted from: daemon, imageStore or both. --at is when, as an
// ISO timestamp, now by default. --dry-run marks nothing, and prints what it would mark. Marking a
// run again is harmless: the purges merge. A later `thunderjar purge` will do this itself.
import { Command, Option } from "commander";
import { openStore } from "../src/cli/dataDir.ts";
import type { PostrunPurge, PurgedFrom, RunDataStore } from "../src/store/runDataStore.ts";

const FROM: readonly PurgedFrom[] = ["daemon", "imageStore", "both"];

export type MarkOptions = { executionIds: string[]; all: boolean; purge: PostrunPurge; dryRun: boolean };

/**
 * Marks the runs of each execution in `options`, or of every execution, purged in `store`, and
 * returns a line per execution and a count at the end. Throws, marking nothing, for an execution
 * not recorded, or with neither IDs nor `all`, or both.
 */
export async function markPostrunsPurged(store: RunDataStore, { executionIds, all, purge, dryRun }: MarkOptions): Promise<string[]> {
  if (all === executionIds.length > 0) throw new Error("Give execution IDs, or --all, not both.");
  const recorded = (await store.listExecutions()).map((execution) => execution.executionId);
  const unknown = executionIds.filter((id) => !recorded.includes(id));
  if (unknown.length > 0) throw new Error(`No execution ${unknown.join(", ")} recorded. Nothing was marked.`);

  const lines: string[] = [];
  let total = 0;
  for (const id of all ? recorded : executionIds) {
    const runs = dryRun ? await store.containerRunsOf(id) : await store.markPostrunsPurged(id, purge);
    total += runs.length;
    if (runs.length === 0) continue;
    const already = dryRun ? runs.filter((run) => run.postrunPurge !== undefined).length : 0;
    lines.push(`${id}  ${runs.length} ${runs.length === 1 ? "run" : "runs"}${already > 0 ? ` (${already} already purged)` : ""}`);
  }
  const what = `${total} container ${total === 1 ? "run" : "runs"}`;
  lines.push(dryRun ? `Would mark ${what} purged. Nothing was changed.` : `Marked ${what} purged.`);
  return lines;
}

if (import.meta.main) {
  const program = new Command("mark-postruns-purged")
    .description("Mark container runs' postrun images as purged in the run data store.")
    .argument("[executions...]", "the IDs of the executions whose runs to mark")
    .option("--all", "mark every execution's runs", false)
    .addOption(new Option("--from <where>", "where the images were deleted from").choices(FROM).makeOptionMandatory())
    .option("--reason <text>", "why they were deleted")
    .option("--at <iso>", "when they were deleted, as an ISO timestamp; now by default")
    .option("--data-dir <dir>", "the folder holding the store, as runs.sqlite, instead of the project config's runDataStore")
    .option("--dry-run", "mark nothing; print what would be marked", false)
    .action(async (executionIds: string[], options: { all: boolean; from: PurgedFrom; reason?: string; at?: string; dataDir?: string; dryRun: boolean }) => {
      const at = options.at === undefined ? new Date() : new Date(options.at);
      if (Number.isNaN(at.getTime())) throw new Error(`--at must be an ISO timestamp, got ${options.at}`);
      const purge: PostrunPurge = { purgedAt: at.toISOString(), from: options.from, ...(options.reason === undefined ? {} : { reason: options.reason }) };
      const { store, where } = await openStore(process.cwd(), options.dataDir);
      console.log(`${options.dryRun ? "Dry run on" : "Marking in"} ${where}`);
      for (const line of await markPostrunsPurged(store, { executionIds, all: options.all, purge, dryRun: options.dryRun })) console.log(line);
    });
  try {
    await program.parseAsync();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
