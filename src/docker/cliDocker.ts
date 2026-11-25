// The real Docker service: each method one of this folder's functions, unchanged, on `runtime`.
// It lives here, not in src/services/Docker/, because `services` is a lower layer than `docker`.
import type { Clock } from "../services/Clock/Clock.ts";
import type { Docker } from "../services/Docker/Docker.ts";
import {
  buildImage,
  checkLogin,
  commitContainer,
  containerRuns,
  containerState,
  diskUsage,
  type DockerRuntime,
  followLogs,
  imagesIn,
  inRegistry,
  localRuntime,
  login,
  pullImage,
  pushImage,
  readContainerFile,
  removeContainer,
  removeContainersNamed,
  runContainer,
  startDetached,
  stderrTail,
  stopContainer,
  writeContainerFile,
} from "./docker.ts";
import { removeLocalImage } from "./localImages.ts";
import { openShellSession } from "./shellSession.ts";

/** Docker over the `docker` CLI, on `runtime`, the local daemon by default, timing its containers by `clock`. */
export function cliDocker(clock: Clock, runtime: DockerRuntime = localRuntime()): Docker {
  const { spawnRun, killContainer } = containerRuns(runtime);
  const docker: Docker = {
    build: (contextDir, image, options) => buildImage(contextDir, image, options, runtime),
    imagesIn: (repository) => imagesIn(repository, runtime),
    removeLocalImage: (image) => removeLocalImage(image),
    checkLogin: (host) => checkLogin(host),
    login: (host, username, password) => login(host, username, password),
    push: (image, reference) => pushImage(image, reference, runtime),
    pull: (reference) => pullImage(reference, runtime),
    inRegistry: (reference) => inRegistry(reference),
    run: (image, name, script, options) => runContainer(image, name, script, { ...options, runtime, clock, docker }),
    commit: (name, image, like, kept) => commitContainer(name, image, like, runtime, kept),
    removeContainer: (name) => removeContainer(name, runtime),
    removeContainersNamed: (prefix) => removeContainersNamed(prefix, runtime),
    startDetached: (image, name, runOptions) => startDetached(image, name, runOptions, runtime),
    stop: (name, graceSeconds) => stopContainer(name, graceSeconds, runtime),
    containerState: (name) => containerState(name, runtime),
    spawnRun,
    killContainer,
    readFile: (name, path) => readContainerFile(name, path, runtime),
    writeFile: (name, path, text) => writeContainerFile(name, path, text, runtime),
    followLogs: (name, onLine, signal) => followLogs(name, runtime, onLine, signal),
    stderrTail: (name, lines) => stderrTail(name, runtime, lines),
    openShellSession: (image, name, env) => openShellSession(image, name, runtime, env),
    diskUsage: () => diskUsage(runtime),
  };
  return docker;
}
