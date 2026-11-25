/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 45581a86-346e-4ac5-a6e9-0b06f43efc84
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Temporary: the new path's DockerService, over the old path's functions in this folder. Each
// method is one of them, unchanged, on `runtime`. It goes once DockerService has an implementation
// of its own. Tests that set THUNDERJAR_DOCKER to src/testing/fakeDocker.ts reach the fake through it.
import type { Clock } from "../services/Clock/Clock.ts";
import type { DockerService } from "../services/Docker/Docker.ts";
import {
  buildImage,
  commitContainer,
  containerState,
  diskUsage,
  type DockerRuntime,
  followLogs,
  imagesIn,
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
import { openShellSession } from "./shellSession.ts";

/** A DockerService on `runtime`, timing its containers by `clock`. */
export function createDockerServiceAdapter(clock: Clock, runtime: DockerRuntime): DockerService {
  return {
    build: (contextDir, image, options) => buildImage(contextDir, image, options, runtime),
    imagesIn: (repository) => imagesIn(repository, runtime),
    push: (image, reference) => pushImage(image, reference, runtime),
    pull: (reference) => pullImage(reference, runtime),
    run: (image, name, script, options) => runContainer(image, name, script, { ...options, runtime, clock }),
    commit: (name, image, like, kept) => commitContainer(name, image, like, runtime, kept),
    removeContainer: (name) => removeContainer(name, runtime),
    removeContainersNamed: (prefix) => removeContainersNamed(prefix, runtime),
    startDetached: (image, name, runOptions) => startDetached(image, name, runOptions, runtime),
    stop: (name, graceSeconds) => stopContainer(name, graceSeconds, runtime),
    containerState: (name) => containerState(name, runtime),
    readFile: (name, path) => readContainerFile(name, path, runtime),
    writeFile: (name, path, text) => writeContainerFile(name, path, text, runtime),
    followLogs: (name, onLine, signal) => followLogs(name, runtime, onLine, signal),
    stderrTail: (name, lines) => stderrTail(name, runtime, lines),
    openShellSession: (image, name, env) => openShellSession(image, name, runtime, env),
    diskUsage: () => diskUsage(runtime),
  };
}
