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

// What `purge image` deletes, and deleting it: the postrun images of chosen executions, and
// prerun images, from the local Docker daemon and the image store. Each postrun image purged is
// marked on its container run's record, so the record says why the image it names is gone. Its
// measures stay, and still count.
//
// From the image store, an image is deleted through the registry's standard API. Once the
// registry refuses a delete, the rest go straight to the store's `deleteCommand`, if it has one;
// without one, they stay, and their runs aren't marked as purged from the store.
import type { ImageStore } from "../api/declarations.ts";
import { imagesIn } from "../docker/docker.ts";
import type { LocalRemoval } from "../docker/localImages.ts";
import { type RegistryClient, RegistryError } from "../docker/registry.ts";
import { moduleLogger } from "../log/logger.ts";
import type { ContainerRunRecord, ExecutionRecord, PostrunPurge, PurgedFrom, RunDataStore } from "../store/runDataStore.ts";
import { postrunImage, prerunImage, prerunRepository, storedPostrunImage, storedPrerunImage } from "./images.ts";

const log = moduleLogger("purge");

export const IMAGE_KINDS = ["postrun", "prerun", "all"] as const;
/** Which images to purge: postrun, prerun, or both. */
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const PURGE_PLACES = ["local", "store", "all"] as const;
/** Where to purge them from: the local daemon, the image store, or both. */
export type PurgePlace = (typeof PURGE_PLACES)[number];

/** An execution ID given isn't recorded. */
export class UnknownExecutionError extends Error {}

/** Which executions' images to purge: by ID, by test case, or all, and only those started before `olderThanMs` ago. */
export type PurgeSelection = { executionIds: string[]; testCase?: string; all: boolean; olderThanMs?: number };

const UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** `text`, an age such as `30d`, `12h`, `90m` or `2w`, in ms. Throws an Error if it isn't one. */
export function parseAge(text: string): number {
  const match = /^(\d+)([mhdw])$/.exec(text.trim());
  if (!match || Number(match[1]) === 0) throw new Error(`${JSON.stringify(text)} is not an age: give a whole number and a unit, m, h, d or w, e.g. 30d or 12h`);
  return Number(match[1]) * UNITS[match[2]!]!;
}

/** Why `selection` can't be purged as `kind`, or undefined if it can. A bare `purge image` never purges everything. */
export function selectionProblem(selection: PurgeSelection, kind: ImageKind, recordOnly: boolean): string | undefined {
  const { executionIds, testCase, all, olderThanMs } = selection;
  const selectors = [executionIds.length > 0, testCase !== undefined, all].filter(Boolean).length;
  if (selectors === 0) return "Say which images to purge: execution IDs, --test-case <name>, or --all.";
  if (selectors > 1) return "Give execution IDs, --test-case or --all: only one of them.";
  if (kind !== "postrun" && executionIds.length > 0) {
    return `Prerun images are shared between executions, so --kind ${kind} needs --test-case or --all, not execution IDs.`;
  }
  if (kind !== "postrun" && olderThanMs !== undefined) return `--older-than picks executions by when they started, and prerun images have no such date: use it with --kind postrun.`;
  if (kind !== "postrun" && recordOnly) return "--record-only marks postrun images in the run data store, and prerun images aren't recorded there: use it with --kind postrun.";
  return undefined;
}

/**
 * The executions of `store` that `selection` names, oldest first, and those it leaves out because
 * they're still running. An execution named by ID is never left out. Throws an Error naming
 * any ID not recorded, an UnknownExecutionError.
 */
export async function selectExecutions(
  store: RunDataStore,
  { executionIds, testCase, all, olderThanMs }: PurgeSelection,
  now: number = Date.now(),
): Promise<{ executions: ExecutionRecord[]; running: ExecutionRecord[] }> {
  const recorded = (await store.listExecutions()).toReversed();
  const old = (execution: ExecutionRecord) => olderThanMs === undefined || Date.parse(execution.startedAt) < now - olderThanMs;
  if (executionIds.length > 0) {
    const unknown = executionIds.filter((id) => !recorded.some((execution) => execution.executionId === id));
    if (unknown.length > 0) throw new UnknownExecutionError(`No execution ${unknown.join(", ")} recorded. List them with \`thunderjar executions\`.`);
    return { executions: recorded.filter((execution) => executionIds.includes(execution.executionId) && old(execution)), running: [] };
  }
  const chosen = recorded.filter((execution) => (all || execution.testCase === testCase) && old(execution));
  return { executions: chosen.filter(({ status }) => status !== "running"), running: chosen.filter(({ status }) => status === "running") };
}

/** One container run's postrun image: its local names, and where it is in the image store, if it was pushed to it. */
export type PostrunTarget = {
  executionId: string;
  run: string;
  permutation: number;
  iteration: number;
  local: string[];
  stored?: string;
};

/**
 * The postrun image of each of `runs`: locally, by its name under `imagePrefix`, and as its record
 * names it, if that's another; in `imageStore`, as its record names it, if it names it there, or
 * else by the name it would have been pushed as. A record made before pushed references were
 * recorded names its image locally though it was pushed, and can't be told from one never pushed:
 * for that one, the store just doesn't have the image, which counts as gone.
 */
export function postrunTargets(runs: ContainerRunRecord[], imagePrefix: string, imageStore: ImageStore | null): PostrunTarget[] {
  return runs.map((record) => {
    const { executionId, permutation, iteration } = record;
    const stored =
      imageStore === null
        ? undefined
        : record.postrunImage.startsWith(`${imageStore.repository}:`)
          ? record.postrunImage
          : storedPostrunImage(imageStore.repository, executionId, record.permutationHash, iteration);
    return {
      executionId,
      run: `${permutation}-${iteration}`,
      permutation,
      iteration,
      local: [...new Set([postrunImage(executionId, permutation, iteration, imagePrefix), record.postrunImage])],
      ...(stored !== undefined && { stored }),
    };
  });
}

/** One prerun image: its local name, and where it is in the image store, either absent if it's not purged there. */
export type PrerunTarget = { local?: string; stored?: string };

/** The prerun images of `hashes`, by their local names and in `imageStore`. */
export function prerunTargetsOf(hashes: string[], imagePrefix: string, imageStore: ImageStore | null, places: Places): PrerunTarget[] {
  return [...new Set(hashes)].map((hash) => ({
    ...(places.local && { local: prerunImage(hash, imagePrefix) }),
    ...(places.store && imageStore !== null && { stored: storedPrerunImage(imageStore.repository, hash) }),
  }));
}

/**
 * Every prerun image there is: in the local daemon, those under `imagePrefix`, and in the image
 * store, its `prerun-h<hash>` tags, paired by hash. Throws a DockerUnavailableError or a RegistryError.
 */
export async function everyPrerun(imagePrefix: string, imageStore: ImageStore | null, places: Places, registry: RegistryClient): Promise<PrerunTarget[]> {
  const byHash = new Map<string, PrerunTarget>();
  const at = (hash: string) => byHash.get(hash) ?? byHash.set(hash, {}).get(hash)!;
  if (places.local) {
    const repository = prerunRepository(imagePrefix);
    for (const image of [...(await imagesIn(repository))].sort()) at(image.slice(repository.length + 1)).local = image;
  }
  if (places.store && imageStore !== null) {
    const prefix = `${imageStore.repository}:prerun-h`;
    for (const reference of (await registry.tagsOf(imageStore.repository)).sort()) {
      if (reference.startsWith(prefix)) at(reference.slice(prefix.length)).stored = reference;
    }
  }
  return [...byHash.values()];
}

/** Where images are purged from: the local daemon, the image store, or both. */
export type Places = { local: boolean; store: boolean };

/** How purging one image from one place went. `by` is how it was deleted from the image store. */
export type Outcome = {
  outcome: "deleted" | "absent" | "failed" | "refused" | "recorded";
  reason?: string;
  by?: "registry" | "deleteCommand";
};

/** Whether an image is gone from a place: deleted, or already gone, or marked so with --record-only. */
export const isGone = (outcome: Outcome | undefined) => outcome !== undefined && (outcome.outcome === "deleted" || outcome.outcome === "absent" || outcome.outcome === "recorded");

/** What deletes images: from the local daemon, and from the image store's registry, falling back to its `deleteCommand`. */
export type Deleters = {
  removeLocal: (image: string) => Promise<LocalRemoval>;
  registry: RegistryClient;
  /** Runs the store's `deleteCommand` for `reference`, returning why it failed, or undefined if it succeeded. */
  runDeleteCommand?: (reference: string) => Promise<string | undefined>;
};

/**
 * Deletes images from the image store: by the registry's API until it refuses one, then, for that
 * one and every one after, by the store's `deleteCommand`, if it has one, or else not at all.
 */
export function storeDeleter({ registry, runDeleteCommand }: Deleters) {
  let refused: string | undefined;
  return async (reference: string): Promise<Outcome> => {
    if (refused === undefined) {
      try {
        const result = await registry.deleteImage(reference);
        if (result.outcome !== "refused") return { outcome: result.outcome, by: "registry" };
        refused = result.reason;
        log.warn({ reference, reason: refused }, "the registry refused a delete");
      } catch (error) {
        if (!(error instanceof RegistryError)) throw error;
        return { outcome: "failed", reason: error.message };
      }
    }
    if (runDeleteCommand === undefined) return { outcome: "refused", reason: refused };
    const failed = await runDeleteCommand(reference);
    return failed === undefined ? { outcome: "deleted", by: "deleteCommand" } : { outcome: "failed", reason: failed, by: "deleteCommand" };
  };
}

/** Removes each of `images` that exists in the local daemon, given those that do: deleted if any was, failed if any failed. */
async function purgeLocal(images: string[], present: Set<string>, removeLocal: Deleters["removeLocal"]): Promise<Outcome> {
  let deleted = false;
  for (const image of images.filter((image) => present.has(image))) {
    const result = await removeLocal(image);
    if (result.outcome === "failed") return { outcome: "failed", reason: `${image}: ${result.reason}` };
    if (result.outcome === "deleted") deleted = true;
  }
  return { outcome: deleted ? "deleted" : "absent" };
}

/** The images in the local daemon, of the repositories of `images`. Throws a DockerUnavailableError. */
export async function presentLocally(images: string[]): Promise<Set<string>> {
  const repositories = new Set(images.map((image) => image.slice(0, image.lastIndexOf(":"))));
  const present = new Set<string>();
  for (const repository of repositories) for (const image of await imagesIn(repository)) present.add(image);
  return present;
}

/** Where a postrun image was purged from, as recorded, given how each place went, or undefined if from neither. */
export function purgedFrom(local: Outcome | undefined, store: Outcome | undefined): PurgedFrom | undefined {
  const fromLocal = isGone(local);
  const fromStore = isGone(store);
  return fromLocal && fromStore ? "both" : fromLocal ? "daemon" : fromStore ? "imageStore" : undefined;
}

export type PostrunResult = PostrunTarget & { localOutcome?: Outcome; storeOutcome?: Outcome; recorded?: PostrunPurge };
export type PrerunResult = PrerunTarget & { localOutcome?: Outcome; storeOutcome?: Outcome };

/**
 * Purges each of `targets`, one execution's postrun images, from `places`, then marks each run
 * purged from somewhere in `store`, at `purgedAt`, with `reason`. With `recordOnly`, deletes
 * nothing: only marks them. Without an image store, no run is purged from one.
 */
export async function purgePostruns(
  targets: PostrunTarget[],
  places: Places,
  options: { recordOnly: boolean; purgedAt: string; reason?: string; present: Set<string>; deleters: Deleters; deleteStored: (reference: string) => Promise<Outcome> },
  store: RunDataStore,
): Promise<PostrunResult[]> {
  const results: PostrunResult[] = [];
  for (const target of targets) {
    const result: PostrunResult = { ...target };
    if (places.local) result.localOutcome = options.recordOnly ? { outcome: "recorded" } : await purgeLocal(target.local, options.present, options.deleters.removeLocal);
    if (places.store && target.stored !== undefined) {
      result.storeOutcome = options.recordOnly ? { outcome: "recorded" } : await options.deleteStored(target.stored);
    }
    results.push(result);
  }
  // Marked per execution, and per place, so each is one write.
  const byPurge = new Map<string, { executionId: string; purge: PostrunPurge; results: PostrunResult[] }>();
  for (const result of results) {
    const from = purgedFrom(result.localOutcome, result.storeOutcome);
    if (from === undefined) continue;
    const purge: PostrunPurge = { purgedAt: options.purgedAt, from, ...(options.reason !== undefined && { reason: options.reason }) };
    const key = `${result.executionId} ${from}`;
    (byPurge.get(key) ?? byPurge.set(key, { executionId: result.executionId, purge, results: [] }).get(key)!).results.push(result);
  }
  for (const { executionId, purge, results: marked } of byPurge.values()) {
    const records = await store.markPostrunsPurged(executionId, purge, marked);
    for (const result of marked) result.recorded = records.find((record) => record.permutation === result.permutation && record.iteration === result.iteration)?.postrunPurge;
  }
  return results;
}

/** Purges each of `targets`, prerun images, from `places`. They aren't recorded anywhere. */
export async function purgePreruns(
  targets: PrerunTarget[],
  options: { present: Set<string>; deleters: Deleters; deleteStored: (reference: string) => Promise<Outcome> },
): Promise<PrerunResult[]> {
  const results: PrerunResult[] = [];
  for (const target of targets) {
    results.push({
      ...target,
      ...(target.local !== undefined && { localOutcome: await purgeLocal([target.local], options.present, options.deleters.removeLocal) }),
      ...(target.stored !== undefined && { storeOutcome: await options.deleteStored(target.stored) }),
    });
  }
  return results;
}
