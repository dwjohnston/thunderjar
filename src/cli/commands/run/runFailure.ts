/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What `run` says on stderr when it stops on an error it knows.
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { RuntimeHookError } from "../../../execution/runtimeHooks.ts";
import { RunDataStoreError } from "../../../store/runDataStore.ts";
import { pushFailure } from "../../format.ts";
import { storeFailure } from "./runDisplay.ts";

/**
 * What to tell the user about `error`, or undefined if it isn't one `run` knows: then it's a bug, and
 * is thrown. `started` is whether the execution had been recorded as started when it failed.
 */
export function describeFailure(error: unknown, cwd: string, started = true): string | undefined {
  if (error instanceof ImageStoreLoginError) return error.message;
  if (error instanceof DockerUnavailableError) return `Docker can't be reached, so nothing can be run: ${error.message}`;
  if (error instanceof DockerBuildError) return `Building ${error.image} failed: ${error.message}`;
  if (error instanceof DockerPushError) return pushFailure(error.reference, error);
  if (error instanceof DockerPullError) {
    return `The runtime couldn't pull ${error.reference}: ${error.message}\nMake sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this.`;
  }
  if (error instanceof RunDataStoreError) return storeFailure(cwd, error, started ? "so the execution stopped" : "so nothing was run");
  if (error instanceof DockerContainerError) return `Docker failed: ${error.message}`;
  if (error instanceof RuntimeHookError) return `The runtime's ${error.hook} failed: ${error.message}`;
  return undefined;
}
