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

// `thunderjar purge image`: deletes the images executions left, from the local Docker daemon and
// the image store, and marks each postrun image purged on its container run's record. It says
// what it would purge and asks first. `purge` is a group: `capture` (capture.ts) is its other command.
import { Command, Option } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig, registryHost } from "../../../config/projectConfig.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { cliDockerService, DockerUnavailableError, localRuntime } from "../../../docker/docker.ts";
import { removeLocalImage } from "../../../docker/localImages.ts";
import { registryClient, RegistryError } from "../../../docker/registry.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import {
  type Deleters,
  everyPrerun,
  IMAGE_KINDS,
  type ImageKind,
  isGone,
  type Outcome,
  type Places,
  type PostrunResult,
  type PostrunTarget,
  postrunTargets,
  presentLocally,
  type PrerunResult,
  type PrerunTarget,
  prerunTargetsOf,
  PURGE_PLACES,
  type PurgePlace,
  purgePostruns,
  purgePreruns,
  type PurgeSelection,
  selectExecutions,
  selectionProblem,
  storeDeleter,
  UnknownExecutionError,
} from "../../../execution/purge.ts";
import { type ExecutionRecord, RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, padEnd, painter, visibleLength } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { confirm } from "../../confirm.ts";
import { dataDirOption, displayPath, openStore, resolvePath } from "../../dataDir.ts";
import { minute, plural } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson, printWarning } from "../../output.ts";
import { olderThanOption } from "./age.ts";
import { createPurgeCaptureCommand } from "./capture.ts";

type ImageOptions = {
  testCase?: string;
  olderThan?: number;
  all?: boolean;
  kind: ImageKind;
  from: PurgePlace;
  reason?: string;
  recordOnly?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  imagePrefix: string;
  dataDir?: string;
  json?: boolean;
};

/** An execution's postrun images to purge. */
type ExecutionTargets = { execution: ExecutionRecord; targets: PostrunTarget[] };

/** Prints `message` as an error, with exit code 1. */
function fail(message: string): void {
  printError(message);
  process.exitCode = 1;
}

/** Where `places` are, in words: `the local daemon and ghcr.io/acme/images`. */
const placesText = ({ local, store }: Places, repository: string | undefined) =>
  [local && "the local daemon", store && repository].filter(Boolean).join(" and ");

/** What would be purged: a line per execution, then each prerun image. */
function planLines(executions: ExecutionTargets[], preruns: PrerunTarget[], paint: Paint): string[] {
  const testCaseWidth = Math.max(0, ...executions.map(({ execution }) => execution.testCase.length));
  const lines = executions.map(
    ({ execution, targets }) =>
      `  ${paint.bold(execution.executionId)}  ${padEnd(paint.magenta(execution.testCase), testCaseWidth)}  ${paint.dim(minute(execution.startedAt))}  ${plural(targets.length, "postrun image")}`,
  );
  for (const { local, stored } of preruns) lines.push(`  ${paint.dim("prerun")}  ${[local, stored].filter(Boolean).map((image) => paint.cyan(image!)).join("  ")}`);
  return lines;
}

/** Runs `command` with `reference` added, in `cwd`: undefined if it exited 0, or else why it failed. */
function deleteCommandRunner(command: string[], cwd: string) {
  return async (reference: string): Promise<string | undefined> => {
    let child;
    try {
      child = Bun.spawn([...command, reference], { cwd, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
    } catch (error) {
      return `\`${command.join(" ")}\` couldn't be started: ${error instanceof Error ? error.message : String(error)}`;
    }
    const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    if (exitCode === 0) return undefined;
    return stderr.trim().split("\n").at(-1) || `\`${command.join(" ")}\` exited ${exitCode}`;
  };
}

/** A failure, as a row: the image, where, and why. */
const failureRow = (image: string, where: string, outcome: Outcome | undefined, paint: Paint): string[] | undefined =>
  outcome === undefined || isGone(outcome) ? undefined : [paint.cyan(image), where, paint.red(`${outcome.outcome}${outcome.reason === undefined ? "" : `  (${outcome.reason})`}`)];

async function purgeImage(cwd: string, executionIds: string[], options: ImageOptions): Promise<void> {
  const { kind, from, imagePrefix, recordOnly = false, dryRun = false, json = false } = options;
  const selection: PurgeSelection = {
    executionIds,
    all: options.all === true,
    ...(options.testCase !== undefined && { testCase: options.testCase }),
    ...(options.olderThan !== undefined && { olderThanMs: options.olderThan }),
  };
  const problem = selectionProblem(selection, kind, recordOnly);
  if (problem) return fail(problem);

  const root = await findThunderjarRoot(cwd);
  const { imageStore } = await loadProjectConfig(root);
  if (from === "store" && imageStore === null) return fail("There's no image store to purge from: the config's imageStore is null.");
  const places: Places = { local: from !== "store", store: from !== "local" && imageStore !== null };
  const repository = imageStore?.repository;
  const registry = registryClient();
  const postruns = kind !== "prerun";
  const preruns = kind !== "postrun";
  // The registry is asked before confirming only to list the store's prerun images.
  const contactsStore = places.store && !recordOnly && (!dryRun || (preruns && selection.all));
  const paint = painter();

  try {
    if (contactsStore) await checkImageStore(imageStore, cliDockerService(localRuntime()));

    let executions: ExecutionTargets[] = [];
    let running: ExecutionRecord[] = [];
    const { store, where } = postruns ? await openStore(cwd, options.dataDir, root) : { store: undefined, where: "" };
    if (store !== undefined) {
      const selected = await selectExecutions(store, selection);
      running = selected.running;
      for (const execution of selected.executions) {
        const targets = postrunTargets(await store.containerRunsOf(execution.executionId), imagePrefix, imageStore);
        if (targets.length > 0) executions.push({ execution, targets });
      }
    }
    let prerunTargets: PrerunTarget[] = [];
    if (preruns && selection.all) prerunTargets = await everyPrerun(imagePrefix, imageStore, places, registry);
    if (preruns && selection.testCase !== undefined) {
      const permutations = await hashPermutations(root, await loadTestCase(root, selection.testCase));
      prerunTargets = prerunTargetsOf(permutations.map(({ imageHash }) => imageHash), imagePrefix, imageStore, places);
    }

    const postrunCount = executions.reduce((sum, { targets }) => sum + targets.length, 0);
    const plan = { dryRun, recordOnly, places: { local: places.local, store: places.store ? (repository ?? null) : null }, running: running.map(({ executionId }) => executionId) };
    for (const execution of running) printWarning(`Leaving out ${execution.executionId}: it's still running.`);
    if (postrunCount === 0 && prerunTargets.length === 0) {
      if (json) printJson({ ...plan, postrun: [], prerun: [] });
      else print("Nothing to purge.");
      return;
    }

    const what = [postrunCount > 0 && `${plural(postrunCount, "postrun image")} of ${plural(executions.length, "execution")}`, prerunTargets.length > 0 && plural(prerunTargets.length, "prerun image")]
      .filter(Boolean)
      .join(", and ");
    print(`${recordOnly ? "Recording as purged, deleting nothing," : dryRun ? "Would purge" : "Purging"} ${what}, from ${placesText(places, repository)}:`);
    for (const line of planLines(executions, prerunTargets, paint)) print(line);
    if (recordOnly && store !== undefined) print(paint.dim(`Recorded in ${displayPath(cwd, where)}.`));

    if (dryRun) {
      if (json) printJson({ ...plan, postrun: executions.flatMap(({ targets }) => targets), prerun: prerunTargets });
      else print(paint.dim("Dry run: nothing was purged."));
      return;
    }
    if (!options.yes) {
      if (!process.stdin.isTTY) return fail("Not purging without asking, and there's no terminal to ask on. Pass --yes to purge, or --dry-run to see what would be.");
      if (!(await confirm(recordOnly ? "Record them as purged?" : "Purge them?"))) return void print("Nothing was purged.");
    }
    // Not a dry run, so the login for the store, if it's purged from, was checked before asking.
    const deleters: Deleters = {
      removeLocal: removeLocalImage,
      registry,
      ...(imageStore?.deleteCommand !== undefined && { runDeleteCommand: deleteCommandRunner(imageStore.deleteCommand, resolvePath(root, "..")) }),
    };
    const deleteStored = storeDeleter(deleters);
    const localNames = [...executions.flatMap(({ targets }) => targets.flatMap(({ local }) => local)), ...prerunTargets.flatMap(({ local }) => local ?? [])];
    const present = places.local && !recordOnly ? await presentLocally(localNames) : new Set<string>();
    const purgedAt = new Date().toISOString();

    const postrunResults: PostrunResult[] = [];
    for (const { execution, targets } of executions) {
      const results = await purgePostruns(targets, places, { recordOnly, purgedAt, ...(options.reason !== undefined && { reason: options.reason }), present, deleters, deleteStored }, store!);
      postrunResults.push(...results);
      const marked = results.filter(({ recorded }) => recorded !== undefined).length;
      const failed = results.length - results.filter(({ localOutcome, storeOutcome }) => (localOutcome === undefined || isGone(localOutcome)) && (storeOutcome === undefined || isGone(storeOutcome))).length;
      print(`${paint.bold(execution.executionId)}  ${plural(marked, "run")} marked purged${failed > 0 ? paint.red(`, ${failed} not purged everywhere`) : ""}`);
    }
    const prerunResults: PrerunResult[] = await purgePreruns(prerunTargets, { present, deleters, deleteStored });

    const failures = [
      ...postrunResults.flatMap(({ local, stored, localOutcome, storeOutcome }) => [
        failureRow(local[0]!, "local", localOutcome, paint),
        failureRow(stored ?? "", "store", storeOutcome, paint),
      ]),
      ...prerunResults.flatMap(({ local, stored, localOutcome, storeOutcome }) => [
        failureRow(local ?? "", "local", localOutcome, paint),
        failureRow(stored ?? "", "store", storeOutcome, paint),
      ]),
    ].filter((row): row is string[] => row !== undefined);
    const marked = postrunResults.filter(({ recorded }) => recorded !== undefined).length;
    const prerunsGone = prerunResults.filter(({ localOutcome, storeOutcome }) => (localOutcome === undefined || isGone(localOutcome)) && (storeOutcome === undefined || isGone(storeOutcome))).length;
    print(
      `${recordOnly ? "Recorded" : "Purged"} ${plural(marked, "postrun image")}${prerunResults.length > 0 ? ` and ${plural(prerunsGone, "prerun image")}` : ""}${failures.length > 0 ? paint.red(`; ${plural(failures.length, "image")} not purged`) : ""}.`,
    );
    if (failures.length > 0) {
      const widths = [0, 1].map((i) => Math.max(...failures.map((row) => visibleLength(row[i]!))));
      for (const row of failures) print(`  ${row.map((cell, i) => (i < 2 ? padEnd(cell, widths[i]!) : cell)).join("  ")}`);
    }
    if (json) printJson({ ...plan, postrun: postrunResults, prerun: prerunResults });

    const refused = [...postrunResults, ...prerunResults].find(({ storeOutcome }) => storeOutcome?.outcome === "refused");
    if (refused !== undefined) {
      return fail(
        `${registryHost(repository!)} refused to delete images (${refused.storeOutcome!.reason}), and the image store has no deleteCommand to delete them another way. They're still in ${repository}, and their runs aren't marked as purged from it.`,
      );
    }
    if (failures.length > 0) return fail(`${plural(failures.length, "image")} couldn't be purged: see above, and the log.`);
  } catch (error) {
    if (error instanceof ImageStoreLoginError) return fail(`Can't purge from ${error.repository}: no valid Docker login for ${error.host} (${error.reason}). Run \`docker login ${error.host}\`.`);
    if (error instanceof RunDataStoreError) return fail(`Can't use ${displayPath(cwd, error.path)}: ${error.message}`);
    if (error instanceof DockerUnavailableError || error instanceof RegistryError) return fail(error.message);
    if (error instanceof UnknownExecutionError) return fail(error.message);
    throw error;
  }
}

export function createPurgeImageCommand(): Command {
  return new Command("image")
    .description(
      "Delete the images executions left, from the local Docker daemon and the image store, and mark each postrun image purged in the run data store: its run's measures stay. Says what it would purge, and asks first.",
    )
    .argument("[executions...]", "the IDs of the executions whose images to purge, as listed by `thunderjar executions`")
    .option("--test-case <name>", "the executions of test case <name>, or with --kind prerun, the prerun images it builds now")
    .addOption(olderThanOption("executions"))
    .option("--all", "every execution, or with --kind prerun, every prerun image")
    .addOption(new Option("--kind <kind>", "which images: the runs' postrun images, the prerun images they start from, or both").choices(IMAGE_KINDS).default("postrun"))
    .addOption(
      new Option("--from <place>", "where from: the local Docker daemon, the image store, or every place the config names").choices(PURGE_PLACES).default("all"),
    )
    .option("--reason <text>", "why, recorded with each postrun image purged")
    .option("--record-only", "delete nothing: only mark the postrun images purged, for images removed some other way")
    .option("-y, --yes", "don't ask first")
    .option("--dry-run", "only say what would be purged")
    .addOption(imagePrefixOption())
    .addOption(dataDirOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (executionIds: string[], options: ImageOptions) => {
        await purgeImage(process.cwd(), executionIds, options);
      }),
    );
}

export function createPurgeCommand(): Command {
  return new Command("purge").description("Delete what executions left behind, and record that it's gone.").addCommand(createPurgeImageCommand()).addCommand(createPurgeCaptureCommand());
}
