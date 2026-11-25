#!/usr/bin/env bun
import type { Manifest, RunDetails } from "../runNext/types.ts";
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [{ createProgram }, { createClockService }, { createEnvService }, { createIoService }, { createDockerService }, { findThunderjarRoot, ConfigError }, { loadProjectConfig }, { dataDirFromArgs, openStore }, { lazyRunDataStore }, { createRandomService }, { createFsService }, { createApplicationStateService }, { createDisplayerService }, { createRuntimeHooksService }, { createRunRenderer, runJson }, { painter }] =
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
      import("../services/RuntimeHooks/RuntimeHooks.ts"),
      import("../runNext/display/renderRun.ts"),
      import("./colour.ts"),
    ]);
  /**
   * The runtime, from the config of the project in `cwd`. Null with no runtime, or no project, or a
   * config that doesn't load: a command that needs the config loads it itself, and says what's
   * wrong with it.
   */
  const configuredRuntime = async (cwd: string): Promise<{ command: string[]; concurrency: number } | null> => {
    try {
      return (await loadProjectConfig(await findThunderjarRoot(cwd))).runtime;
    } catch (caught) {
      if (caught instanceof ConfigError) return null;
      throw caught;
    }
  };
  /** A whole number of 0 or more from the variable `name`, or `fallback` if it's unset or isn't one. */
  const setting = (name: string, fallback: number, least = 0): number => {
    const value = Number(env.variables[name] || Number.NaN);
    return Number.isInteger(value) && value >= least ? value : fallback;
  };
  // Every service is built here, and only here: see src/services/HUMANS.md.
  const env = createEnvService();
  const args = process.argv.slice(2);
  const hostDocker = createDockerService([env.variables.THUNDERJAR_DOCKER || "docker"]);
  // Where containers run is the config's choice alone: a project picks between a local and a remote run there.
  const runtime = await configuredRuntime(env.cwd);
  const runtimeDocker = runtime === null ? hostDocker : createDockerService(runtime.command, { remote: true });
  // The same store `openStore` gives each command; --data-dir is read here, ahead of Commander, until tests use a FakeRunDataStore.
  const dataDir = dataDirFromArgs(args);
  let opened: ReturnType<typeof openStore> | undefined;
  const open = () => (opened ??= openStore(env.cwd, dataDir, undefined, env.variables));
  const runDataStore = lazyRunDataStore(async () => (await open()).store);
  const clock = createClockService();
  const io = createIoService();
  const state = createApplicationStateService<Manifest, RunDetails>();
  // Read ahead of Commander, as the store is: with --json, progress goes to stderr, so that's what's coloured.
  const json = args.includes("--json");
  // TODO: logPath is worked out in program.ts's preAction hook, after this.
  const renderRun = createRunRenderer({ paint: painter(json ? io.stderr : io.stdout), cwd: env.cwd, showTimings: args.includes("--timings") });
  const displayer = createDisplayerService({
    state,
    clock,
    stdout: io.stdout,
    stderr: io.stderr,
    logPath: undefined,
    // With --json, a dry run's text isn't progress: the JSON on stdout is all of it.
    render: (run, now) => (json && run.details?.mode === "dry-run" ? { settled: "", live: "" } : renderRun(run, now)),
    toJson: runJson,
  });
  const runSettings = {
    concurrency: setting("THUNDERJAR_CONCURRENCY", runtime?.concurrency ?? 1, 1),
    uploadBacklogCap: setting("THUNDERJAR_UPLOAD_BACKLOG_CAP", 4),
    cacheWarmupMs: setting("THUNDERJAR_CACHE_WARMUP_MS", 5_000),
    uploadConcurrency: setting("THUNDERJAR_UPLOAD_CONCURRENCY", 2, 1),
    runStoreLocation: async () => (await open()).where,
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
    runtimeHooks: createRuntimeHooksService(),
  }).parseAsync();
}
