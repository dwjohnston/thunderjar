#!/usr/bin/env bun
import { harnessArg, isHook, runHookCommand } from "./commands/capture/hook.ts";

// A capture hook runs twice a turn, so it skips loading the rest of the CLI: see commands/capture/hook.ts.
const [command, hook, ...rest] = process.argv.slice(2);
if (command === "capture" && isHook(hook)) {
  await runHookCommand(hook, harnessArg(rest));
} else {
  const [
    { createProgram },
    { createClockService },
    { createEnvService },
    { createIoService },
    { createRandomService },
    { createFsService },
    { createCommandRunnerService },
    { createApplicationStateService },
    { createDisplayerService },
    { createDockerServiceAdapter },
    { localRuntime, remoteRuntime },
    { findThunderjarRoot, ConfigError },
    { loadProjectConfig },
    { createStores },
    { createMeasurer },
    { renderRunState, runJson },
    { logPath },
  ] = await Promise.all([
    import("./program.ts"),
    import("../services/Clock/Clock.ts"),
    import("../services/Env/Env.ts"),
    import("../services/Io/Io.ts"),
    import("../services/Random/Random.ts"),
    import("../services/Fs/Fs.ts"),
    import("../services/CommandRunner/CommandRunner.ts"),
    import("../services/ApplicationState/ApplicationState.ts"),
    import("../services/Displayer/Displayer.ts"),
    import("../docker/dockerServiceAdapter.ts"),
    import("../docker/docker.ts"),
    import("../config/loader.ts"),
    import("../config/projectConfig.ts"),
    import("../store/stores.ts"),
    import("../execution/run/measurer.ts"),
    import("../execution/run/render.ts"),
    import("../log/logger.ts"),
  ]);
  type Manifest = import("../execution/run/types.ts").Manifest;
  type Displayer = import("../services/Displayer/Displayer.ts").Displayer;
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
  const clock = createClockService();
  const io = createIoService();
  // Both over the functions of src/docker/docker.ts, through an adapter, until DockerService has an implementation of its own.
  const hostDocker = createDockerServiceAdapter(clock, localRuntime());
  // Where containers run is the config's to say: its runtime's command, or else the host's Docker.
  const command = await dockerRuntimeCommand(env.cwd);
  const runtimeDocker = command === null ? hostDocker : createDockerServiceAdapter(clock, remoteRuntime(command));
  const state = createApplicationStateService<Manifest>();
  // Made when first used: where the log goes is only known once the command line is parsed.
  let made: Displayer | undefined;
  const real = () => (made ??= createDisplayerService({ state, clock, stdout: io.stdout, stderr: io.stderr, logPath: logPath(), render: renderRunState, toJson: runJson }));
  const displayer: Displayer = { setMode: (mode) => real().setMode(mode), start: () => real().start(), stop: () => real().stop() };
  await createProgram({
    env,
    clock,
    random: createRandomService(clock),
    fs: createFsService(),
    io,
    hostDocker,
    runtimeDocker,
    commands: createCommandRunnerService(env),
    stores: createStores(env),
    measurer: createMeasurer({ docker: runtimeDocker, clock }),
    state,
    displayer,
  }).parseAsync();
}
