/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What `run` says when it stops on an error: one message for each kind it knows, saying what it
// meant for the execution and what to check. Level 1 writes it to the state's `failure`, and the
// displayer shows it as `Error: <failure>`.
import { ConfigError } from "../../config/loader.ts";
import { registryHost } from "../../config/projectConfig.ts";
import { DockerBuildError, DockerContainerError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../services/Docker/errors.ts";
import { RunDataStoreError } from "../../store/runDataStore.ts";
import { ImageStoreLoginError } from "../imageStore.ts";
import { displayPath } from "./render.ts";
import { RuntimeHookError } from "./runTestCase.ts";

export type FailureContext = {
  /** Where the command was run: paths inside it are shown from it. */
  cwd: string;
  /** Whether any run had started when it failed. */
  started?: boolean;
};

/** Why pushing `reference` failed, and what to check. */
export function pushFailure(reference: string, message: string): string {
  const repository = reference.slice(0, reference.lastIndexOf(":"));
  return `Pushing ${reference} failed: ${message}\nCheck that your Docker login for ${registryHost(repository)} can push to ${repository}: on ghcr.io, a token needs the write:packages scope.`;
}

/**
 * The message for `error`, whatever was thrown. Pure. A ConfigError's problems come out one to a
 * line, each after the first starting with `Error: `, so that shown after one `Error: ` every
 * problem has its own.
 */
export function describeFailure(error: unknown, { cwd, started = false }: FailureContext): string {
  if (error instanceof ConfigError) return error.problems.join("\nError: ");
  if (error instanceof ImageStoreLoginError) return error.message;
  if (error instanceof DockerUnavailableError) return `Docker can't be reached, so nothing can be run: ${error.message}`;
  if (error instanceof DockerBuildError) return `Building ${error.image} failed: ${error.message}`;
  if (error instanceof DockerPushError) return pushFailure(error.reference, error.message);
  if (error instanceof DockerPullError) {
    return `The runtime couldn't pull ${error.reference}: ${error.message}\nMake sure it can reach the image store's registry and is logged in to it. \`thunderjar doctor\` checks this.`;
  }
  if (error instanceof RunDataStoreError) {
    const consequence = started ? "so the execution stopped" : "so nothing was run";
    return `Can't use the run data store, ${displayPath(cwd, error.path)}, ${consequence}: ${error.message}\nCheck it can be reached from here, or pass --data-dir to record in a local SQLite file instead.`;
  }
  if (error instanceof DockerContainerError) return `Running or measuring a container failed: ${error.message}`;
  if (error instanceof RuntimeHookError) return `The runtime's ${error.hook} failed: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
