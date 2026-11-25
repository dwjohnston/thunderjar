import { emptyApplicationState, type ApplicationState, type ApplicationStateService } from "./ApplicationState";

/**
 * An ApplicationStateService that keeps every state it has held, so a test can check what a lower
 * level wrote along the way, not just where it ended.
 */
export class FakeApplicationState<M = unknown> implements ApplicationStateService<M> {
  private readonly states: ApplicationState<M>[];

  constructor(initial: ApplicationState<M> = emptyApplicationState<M>()) {
    this.states = [initial];
  }

  get(): ApplicationState<M> {
    return this.states.at(-1)!;
  }

  update(fn: (s: ApplicationState<M>) => ApplicationState<M>): void {
    this.states.push(fn(this.get()));
  }

  /** Every state held, oldest first, starting with the initial one. */
  history(): readonly ApplicationState<M>[] {
    return this.states;
  }
}
