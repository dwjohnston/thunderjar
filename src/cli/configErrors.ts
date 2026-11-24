import { ConfigError } from "../config/loader.ts";
import { type Printer, printError } from "./output.ts";

/**
 * `action`, but a ConfigError it throws is printed as `Error: <problem>` lines on stderr, with
 * exit code 1, instead of a stack trace.
 */
export function reportingConfigErrors<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      for (const problem of error.problems) printError(problem);
      process.exitCode = 1;
    }
  };
}

/** `action`'s exit code, or 1 after printing each problem of a ConfigError it throws, as `Error: <problem>` lines. */
export async function exitCodeOf(out: Printer, action: () => Promise<number>): Promise<number> {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    for (const problem of error.problems) out.printError(problem);
    return 1;
  }
}
