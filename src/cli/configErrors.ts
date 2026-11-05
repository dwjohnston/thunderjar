import { ConfigError } from "../config/loader.ts";

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
      for (const problem of error.problems) console.error(`Error: ${problem}`);
      process.exitCode = 1;
    }
  };
}
