#!/usr/bin/env bun
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { createClockService }, { createEnvService }, { createIoService }, { createDockerService }, { findThunderjarRoot, ConfigError }, { loadProjectConfig }] =
    await Promise.all([
      import("./program.ts"),
      import("../services/Clock/Clock.ts"),
      import("../services/Env/Env.ts"),
      import("../services/Io/Io.ts"),
      import("../services/Docker/Docker.ts"),
      import("../config/loader.ts"),
      import("../config/projectConfig.ts"),
    ]);
  /**
   * The runtime's command, from the config of the project in `cwd`. Null with no runtime, or no
   * project, or a config that doesn't load: a command that needs the config loads it itself, and
   * says what's wrong with it.
   */
  const dockerRuntimeCommand = async (cwd: string): Promise<string[] | null> => {
    try {
      return (await loadProjectConfig(await findThunderjarRoot(cwd))).runtime?.command ?? null;
    } catch (caught) {
      if (caught instanceof ConfigError) return null;
      throw caught;
    }
  };
  // Every service is built here, and only here: see src/services/HUMANS.md.
  const env = createEnvService();
  const hostDocker = createDockerService([env.variables.THUNDERJAR_DOCKER || "docker"]);
  const command = await dockerRuntimeCommand(env.cwd);
  const runtimeDocker = command === null ? hostDocker : createDockerService(command);
  await createProgram({ clock: createClockService(), env, io: createIoService(), hostDocker, runtimeDocker }).parseAsync();
}
