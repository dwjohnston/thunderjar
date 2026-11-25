import { emptyApplicationState, type ApplicationState, type ApplicationStateService } from "./ApplicationState";

/**
 * An ApplicationStateService that keeps every state it has held, so a test can check what a lower
 * level wrote along the way, not just where it ended.
 */
export class FakeApplicationState<M = unknown, D = unknown> implements ApplicationStateService<M, D> {
  private readonly states: ApplicationState<M, D>[];

  constructor(initial: ApplicationState<M, D> = emptyApplicationState<M, D>()) {
    this.states = [initial];
  }

  get(): ApplicationState<M, D> {
    return this.states.at(-1)!;
  }

  update(fn: (s: ApplicationState<M, D>) => ApplicationState<M, D>): void {
    this.states.push(fn(this.get()));
  }

  /** Every state held, oldest first, starting with the initial one. */
  history(): readonly ApplicationState<M, D>[] {
    return this.states;
  }
}
