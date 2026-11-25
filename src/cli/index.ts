#!/usr/bin/env bun
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { SystemClock }, { processEnv }, { processIo }, { cliDocker }] = await Promise.all([
    import("./program.ts"),
    import("../services/Clock/Clock.ts"),
    import("../services/Env/Env.ts"),
    import("../services/Io/Io.ts"),
    import("../docker/cliDocker.ts"),
  ]);
  // Every service is built here, and only here: see src/services/HUMANS.md.
  const clock = new SystemClock();
  await createProgram({ clock, env: processEnv(), io: processIo(), docker: cliDocker(clock) }).parseAsync();
}
