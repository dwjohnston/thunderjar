// An in-memory RunDataStore for tests: it behaves like the real stores (see
// RunDataStore.comprehensive.test.ts), and keeps everything in two Maps a test can seed and read.
import {
  type ContainerRunRecord,
  type ExecutionRecord,
  markedRuns,
  type RunDataStore,
  type RunDataStoreError,
} from "./RunDataStore.ts";

export type FakeRunDataStoreSeed = {
  executions?: ExecutionRecord[];
  containerRuns?: ContainerRunRecord[];
};

const runKey = (executionId: string, permutation: number, iteration: number) => `${executionId}/${permutation}/${iteration}`;

/** Records are copied in and out, so a test that changes one it was given doesn't change the store. */
const copy = <T>(value: T): T => structuredClone(value);

export class FakeRunDataStore implements RunDataStore {
  readonly executions = new Map<string, ExecutionRecord>();
  readonly containerRuns = new Map<string, ContainerRunRecord>();
  /** Set it to make `check`, and every other call, throw it: a store that can't be reached. */
  failure: RunDataStoreError | undefined;

  constructor({ executions = [], containerRuns = [] }: FakeRunDataStoreSeed = {}) {
    for (const record of executions) this.executions.set(record.executionId, copy(record));
    for (const record of containerRuns) this.containerRuns.set(runKey(record.executionId, record.permutation, record.iteration), copy(record));
  }

  private throwIfFailing(): void {
    if (this.failure) throw this.failure;
  }

  async recordExecution(record: ExecutionRecord): Promise<void> {
    this.throwIfFailing();
    this.executions.set(record.executionId, copy(record));
  }

  async recordContainerRun(record: ContainerRunRecord): Promise<void> {
    this.throwIfFailing();
    this.containerRuns.set(runKey(record.executionId, record.permutation, record.iteration), copy(record));
  }

  async listExecutions(): Promise<ExecutionRecord[]> {
    this.throwIfFailing();
    // ULIDs sort by time.
    return [...this.executions.values()].sort((a, b) => (a.executionId < b.executionId ? 1 : a.executionId > b.executionId ? -1 : 0)).map(copy);
  }

  async containerRunsOf(executionId: string): Promise<ContainerRunRecord[]> {
    this.throwIfFailing();
    return this.runsOf(executionId).map(copy);
  }

  async markPostrunsPurged(...[executionId, purge, runs]: Parameters<RunDataStore["markPostrunsPurged"]>): Promise<ContainerRunRecord[]> {
    this.throwIfFailing();
    const marked = markedRuns(this.runsOf(executionId), purge, runs);
    for (const run of marked) this.containerRuns.set(runKey(run.executionId, run.permutation, run.iteration), copy(run));
    return marked.map(copy);
  }

  async check(): Promise<void> {
    this.throwIfFailing();
  }

  private runsOf(executionId: string): ContainerRunRecord[] {
    return [...this.containerRuns.values()]
      .filter((run) => run.executionId === executionId)
      .sort((a, b) => a.permutation - b.permutation || a.iteration - b.iteration);
  }
}
