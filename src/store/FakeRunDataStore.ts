/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import {
  type ContainerRunRecord,
  type ExecutionRecord,
  mergePurge,
  type PostrunPurge,
  type RunDataStore,
  RunDataStoreError,
  type RunKey,
} from "./runDataStore.ts";
import type { OpenStore, Stores } from "./stores.ts";

/** Where a FakeRunDataStore says it is, in its errors and from FakeStores. */
export const MEMORY = "memory";

/**
 * A RunDataStore held in memory, for tests: the same replacing and ordering as the SQLite one.
 * A test reads `executions` and `containerRuns` to see what was recorded, and makes writes fail
 * with `failWith`, e.g. `store.failWith("disk full")`.
 */
export class FakeRunDataStore implements RunDataStore {
  private readonly executionsById = new Map<string, ExecutionRecord>();
  private readonly runsByKey = new Map<string, ContainerRunRecord>();
  private writeFailure: string | undefined;
  private checkFailure: string | undefined;

  /** Each write that got through, in order, e.g. `recordContainerRun 01a 1-2`. */
  readonly writes: string[] = [];

  /** Every write throws a RunDataStoreError with `message` from now on; `undefined` lets them through again. */
  failWith(message: string | undefined): void {
    this.writeFailure = message;
  }

  /** `check` throws a RunDataStoreError with `message` from now on; `undefined` lets it pass again. */
  failCheckWith(message: string | undefined): void {
    this.checkFailure = message;
  }

  /** Every execution recorded, newest first. */
  get executions(): ExecutionRecord[] {
    // ULIDs sort by time.
    return [...this.executionsById.values()].sort((a, b) => (a.executionId < b.executionId ? 1 : a.executionId > b.executionId ? -1 : 0)).map(copy);
  }

  /** Every container run recorded, by execution, permutation, then iteration. */
  get containerRuns(): ContainerRunRecord[] {
    return [...this.runsByKey.values()]
      .sort((a, b) => (a.executionId < b.executionId ? -1 : a.executionId > b.executionId ? 1 : a.permutation - b.permutation || a.iteration - b.iteration))
      .map(copy);
  }

  async recordExecution(record: ExecutionRecord): Promise<void> {
    this.write(`recordExecution ${record.executionId}`);
    this.executionsById.set(record.executionId, copy(record));
  }

  async recordContainerRun(record: ContainerRunRecord): Promise<void> {
    this.write(`recordContainerRun ${record.executionId} ${record.permutation}-${record.iteration}`);
    this.runsByKey.set(keyOf(record), copy(record));
  }

  async listExecutions(): Promise<ExecutionRecord[]> {
    return this.executions;
  }

  async containerRunsOf(executionId: string): Promise<ContainerRunRecord[]> {
    return this.containerRuns.filter((run) => run.executionId === executionId);
  }

  async markPostrunsPurged(executionId: string, purge: PostrunPurge, runs?: readonly RunKey[]): Promise<ContainerRunRecord[]> {
    this.write(`markPostrunsPurged ${executionId}`);
    const chosen = (await this.containerRunsOf(executionId)).filter(
      (run) => runs === undefined || runs.some((key) => key.permutation === run.permutation && key.iteration === run.iteration),
    );
    const marked = chosen.map((run) => ({ ...run, postrunPurge: mergePurge(run.postrunPurge, purge) }));
    for (const run of marked) this.runsByKey.set(keyOf(run), copy(run));
    return marked;
  }

  async check(): Promise<void> {
    if (this.checkFailure !== undefined) throw new RunDataStoreError(MEMORY, this.checkFailure);
  }

  private write(what: string): void {
    if (this.writeFailure !== undefined) throw new RunDataStoreError(MEMORY, this.writeFailure);
    this.writes.push(what);
  }
}

const keyOf = (run: ContainerRunRecord) => `${run.executionId} ${run.permutation} ${run.iteration}`;

// Through JSON, as the real stores keep records: a record can't change in the store after it's written or read.
const copy = <T>(record: T): T => JSON.parse(JSON.stringify(record)) as T;

/**
 * A Stores for tests: always opens `store`, in memory, and keeps what it was asked for in
 * `opened`, e.g. `[undefined]` for one open with no `--data-dir`.
 */
export class FakeStores implements Stores {
  /** The `dataDir` of each `open`, in order. */
  readonly opened: (string | undefined)[] = [];

  constructor(readonly store: FakeRunDataStore = new FakeRunDataStore()) {}

  async open(dataDir?: string): Promise<OpenStore> {
    this.opened.push(dataDir);
    return { store: this.store, where: MEMORY };
  }
}
