#!/usr/bin/env bun
import type { Manifest } from "../runNext/types.ts";
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { createClockService }, { createEnvService }, { createIoService }, { createDockerService }, { findThunderjarRoot, ConfigError }, { loadProjectConfig }, { dataDirFromArgs, openStore }, { lazyRunDataStore }, { createRandomService }, { createFsService }, { createApplicationStateService }, { createDisplayerService }, { renderRun, fitTo }, { painter }] =
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
      import("../services/Displayer/renderRun/renderRun.ts"),
      import("./colour.ts"),
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
  const runtimeDocker = command === null ? hostDocker : createDockerService(command, { remote: true });
  // The same store `openStore` gives each command; --data-dir is read here, ahead of Commander, until tests use a FakeRunDataStore.
  const dataDir = dataDirFromArgs(process.argv.slice(2));
  let opened: ReturnType<typeof openStore> | undefined;
  const openOnce = () => (opened ??= openStore(env.cwd, dataDir, undefined, env.variables));
  const runDataStore = lazyRunDataStore(async () => (await openOnce()).store);
  const clock = createClockService();
  const io = createIoService();
  const state = createApplicationStateService<Manifest>();
  const paint = painter(io.stdout);
  // TODO: logPath is worked out in program.ts's preAction hook, after this.
  const displayer = createDisplayerService({
    state,
    clock,
    stdout: io.stdout,
    stderr: io.stderr,
    logPath: undefined,
    // A frame that will be redrawn is cut to the terminal's width; the last one is whole.
    render: (run, now, final) => {
      const frame = renderRun(run, now, { paint, cwd: env.cwd });
      return final || io.stdout.columns === undefined ? frame : fitTo(frame, io.stdout.columns);
    },
  });
  /** A whole number of at least `least` in the variable `name`, or `fallback` if it's unset or isn't one. */
  const setting = <T>(name: string, least: number, fallback: T): number | T => {
    const value = Number(env.variables[name]);
    return env.variables[name] !== undefined && Number.isInteger(value) && value >= least ? value : fallback;
  };
  const runSettings = {
    concurrency: setting("THUNDERJAR_CONCURRENCY", 1, undefined),
    uploadBacklogCap: setting("THUNDERJAR_UPLOAD_BACKLOG_CAP", 0, 4),
    uploadConcurrency: setting("THUNDERJAR_UPLOAD_CONCURRENCY", 1, 2),
    cacheWarmupMs: setting("THUNDERJAR_CACHE_WARMUP_MS", 0, 5_000),
  };
  await createProgram({
    clock,
    env,
    io,
    hostDocker,
    runtimeDocker,
    runDataStore,
    runDataStoreLocation: async () => (await openOnce()).where,
    random: createRandomService(clock),
    fs: createFsService(),
    state,
    displayer,
    runSettings,
  }).parseAsync();
}
