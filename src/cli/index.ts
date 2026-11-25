#!/usr/bin/env bun
import type { Manifest } from "../runNext/types.ts";
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { createClockService }, { createEnvService }, { createIoService }, { createDockerService }, { findThunderjarRoot, ConfigError }, { loadProjectConfig }, { dataDirFromArgs, openStore }, { lazyRunDataStore }, { createRandomService }, { createFsService }, { createApplicationStateService }, { createDisplayerService }] =
    await Promise.all([
      import("./program.ts"),
      import("../services/Clock/Clock.ts"),
      import("../services/Env/Env.ts"),
      import("../services/Io/Io.ts"),
      import("../services/Docker/Docker.ts"),
      import("../config/loader.ts"),
      import("../config/projectConfig.ts"),
      import("./dataDir.ts"),
      import("../services/RunDataStore/RunDataStore.ts"),
      import("../services/Random/Random.ts"),
      import("../services/Fs/Fs.ts"),
      import("../services/ApplicationState/ApplicationState.ts"),
      import("../services/Displayer/Displayer.ts"),
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
  // The same store `openStore` gives each command; --data-dir is read here, ahead of Commander, until tests use a FakeRunDataStore.
  const dataDir = dataDirFromArgs(process.argv.slice(2));
  const runDataStore = lazyRunDataStore(async () => (await openStore(env.cwd, dataDir, undefined, env.variables)).store);
  const clock = createClockService();
  const io = createIoService();
  const state = createApplicationStateService<Manifest>();
  // TODO: logPath is worked out in program.ts's preAction hook, after this.
  const displayer = createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: undefined });
  const runSettings = {
    concurrency: Number(env.variables.THUNDERJAR_CONCURRENCY ?? 1),
    uploadBacklogCap: Number(env.variables.THUNDERJAR_UPLOAD_BACKLOG_CAP ?? 4),
  };
  await createProgram({
    clock,
    env,
    io,
    hostDocker,
    runtimeDocker,
    runDataStore,
    random: createRandomService(clock),
    fs: createFsService(),
    state,
    displayer,
    runSettings,
  }).parseAsync();
}
