#!/usr/bin/env bun
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { createClockService }, { createEnvService }, { createIoService }, { createDockerService }, { remoteRuntime }] = await Promise.all([
    import("./program.ts"),
    import("../services/Clock/Clock.ts"),
    import("../services/Env/Env.ts"),
    import("../services/Io/Io.ts"),
    import("../docker/cliDocker.ts"),
    import("../docker/docker.ts"),
  ]);
  // Every service is built here, and only here: see src/services/HUMANS.md.
  const clock = createClockService();
  const hostDocker = createDockerService(clock);
  // The runtime comes from the project's config, loaded by each command: so it's built when asked for.
  const runtimeDocker = (runtime: { command: string[] } | null) => (runtime === null ? hostDocker : createDockerService(clock, remoteRuntime(runtime.command)));
  await createProgram({ clock, env: createEnvService(), io: createIoService(), hostDocker, runtimeDocker }).parseAsync();
}
