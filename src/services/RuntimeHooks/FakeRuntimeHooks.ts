import { RuntimeHookError, type RunFacts, type RuntimeHooks } from "./RuntimeHooks.ts";

/** A RuntimeHooks that runs nothing and records each hook it was asked to run, in order. */
export class FakeRuntimeHooks implements RuntimeHooks {
  readonly ran: { hook: "beforeExecution" | "afterExecution"; command: string[]; facts: RunFacts }[] = [];
  /** The hooks that fail, each with its reason. */
  readonly failing: Partial<Record<"beforeExecution" | "afterExecution", string>> = {};

  async run(hook: "beforeExecution" | "afterExecution", command: string[], facts: RunFacts): Promise<void> {
    this.ran.push({ hook, command, facts });
    const reason = this.failing[hook];
    if (reason !== undefined) throw new RuntimeHookError(reason, hook);
  }
}
