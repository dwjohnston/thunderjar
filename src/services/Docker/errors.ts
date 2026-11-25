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

// What Docker throws. They live with the service, so a FakeDocker throws the same classes as the
// real one; src/docker/docker.ts and src/docker/registry.ts re-export them under their old paths.

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

/** Thrown when `docker build` fails: the message is Docker's reason, and `image` the image it was building. */
export class DockerBuildError extends Error {
  constructor(
    message: string,
    readonly image = "",
  ) {
    super(message);
  }
}

/** Thrown when `docker login` finds no valid login for a registry: the message is Docker's reason. */
export class DockerLoginError extends Error {}

/** Thrown when tagging or pushing an image fails: the message is Docker's reason, and `reference` where it was pushing to. */
export class DockerPushError extends Error {
  constructor(
    message: string,
    readonly reference = "",
  ) {
    super(message);
  }
}

/** Thrown when running, reading from, committing or removing a container fails: the message is Docker's reason. */
export class DockerContainerError extends Error {}

/** Thrown when a runtime can't pull an image from the image store: the message is Docker's reason, and `reference` the image. */
export class DockerPullError extends Error {
  constructor(
    message: string,
    readonly reference = "",
  ) {
    super(message);
  }
}

/** The registry couldn't be asked, or answered with an error that isn't a refusal, e.g. a 500. */
export class RegistryError extends Error {}
