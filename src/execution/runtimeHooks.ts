// A runtime's `beforeExecution` and `afterExecution` commands: run once around an execution, e.g.
// to start a remote runtime and size it for the execution, then release it. Each is told about the
// execution through variables.

/** Thrown when a runtime hook exits non-zero, or can't be started: the message is its reason. */
export class RuntimeHookError extends Error {
  constructor(
    message: string,
    readonly hook: "beforeExecution" | "afterExecution",
  ) {
    super(message);
  }
}

/** What a hook is told about the execution. */
export type RunFacts = {
  executionId: string;
  /** How many containers run at once. */
  concurrency: number;
  /** How many runs the execution has, each in its own container: every iteration of every permutation. */
  containers: number;
};

/** The variables a hook is given, for `facts`. */
export const hookEnv = ({ executionId, concurrency, containers }: RunFacts): Record<string, string> => ({
  THUNDERJAR_EXECUTION_ID: executionId,
  THUNDERJAR_CONCURRENCY: String(concurrency),
  THUNDERJAR_CONTAINERS: String(containers),
});

/**
 * Runs `command`, the runtime's `hook`, with the variables for `facts` added to the environment,
 * and waits for it. Throws a RuntimeHookError, with the last line it wrote to stderr, if it exits
 * non-zero or can't be started.
 */
export async function runRuntimeHook(hook: "beforeExecution" | "afterExecution", command: string[], facts: RunFacts): Promise<void> {
  let child;
  try {
    child = Bun.spawn(command, { env: { ...Bun.env, ...hookEnv(facts) }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  } catch (caught) {
    throw new RuntimeHookError(caught instanceof Error ? caught.message : String(caught), hook);
  }
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (exitCode === 0) return;
  const reason = stderr.trim().split("\n").at(-1);
  throw new RuntimeHookError(reason || `\`${command.join(" ")}\` exited ${exitCode}`, hook);
}
