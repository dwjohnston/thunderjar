// The Docker module, running the fake Docker in place of `docker`.
import { afterEach, expect, test } from "bun:test";
import { FAKE_DOCKER, fakeDocker } from "../testing/fakeDocker.ts";
import { $ } from "bun";
import { FIXTURES_DIR } from "../testing/scenario.ts";
import {
  buildImage,
  commitContainer,
  DockerBuildError,
  DockerContainerError,
  DockerUnavailableError,
  execInContainer,
  imagesIn,
  readContainerFile,
  removeContainer,
  runContainer,
  startContainer,
} from "./docker.ts";

const saved = { THUNDERJAR_DOCKER: Bun.env.THUNDERJAR_DOCKER, FAKE_DOCKER_DIR: Bun.env.FAKE_DOCKER_DIR };

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete Bun.env[name];
    else Bun.env[name] = value;
  }
});

test("imagesIn lists the tagged images of one repository, in one command", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa", "tj-prerun:bbbbbbbb", "tj-postrun:x-1-1", "other-prerun:cccccccc"] });
  Object.assign(Bun.env, docker.env);

  expect(await imagesIn("tj-prerun")).toEqual(new Set(["tj-prerun:aaaaaaaa", "tj-prerun:bbbbbbbb"]));
  expect(await docker.commands()).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} tj-prerun"]);
});

test("imagesIn throws a DockerUnavailableError with Docker's reason when the daemon can't be reached", async () => {
  await using docker = await fakeDocker({ unreachable: true });
  Object.assign(Bun.env, docker.env);

  const error = await imagesIn("tj-prerun").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DockerUnavailableError);
  expect((error as Error).message).toBe(
    "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
  );
});

test("imagesIn throws a DockerUnavailableError when there's no docker command", async () => {
  Bun.env.THUNDERJAR_DOCKER = `${FAKE_DOCKER}.missing`;

  await expect(imagesIn("tj-prerun")).rejects.toBeInstanceOf(DockerUnavailableError);
});

test("buildImage builds the context's Dockerfile and tags the image", async () => {
  await using docker = await fakeDocker();
  Object.assign(Bun.env, docker.env);
  const context = `${FIXTURES_DIR}/.tmp/context-${crypto.randomUUID()}`;
  await Bun.write(`${context}/Dockerfile`, "FROM scratch\n");

  try {
    await buildImage(context, "tj-prerun:aaaaaaaa");
  } finally {
    await $`rm -rf ${context}`.quiet();
  }

  expect(await docker.commands()).toEqual([`docker build -t tj-prerun:aaaaaaaa ${context}`]);
  expect(await imagesIn("tj-prerun")).toEqual(new Set(["tj-prerun:aaaaaaaa"]));
});

test("buildImage throws a DockerBuildError with Docker's reason when the build fails", async () => {
  await using docker = await fakeDocker({ failing: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);
  const context = `${FIXTURES_DIR}/.tmp/context-${crypto.randomUUID()}`;
  await Bun.write(`${context}/Dockerfile`, "FROM scratch\n");

  const error = await buildImage(context, "tj-prerun:aaaaaaaa").catch((e: unknown) => e);
  await $`rm -rf ${context}`.quiet();

  expect(error).toBeInstanceOf(DockerBuildError);
  expect((error as Error).message).toBe(
    'ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1',
  );
  expect(await imagesIn("tj-prerun")).toEqual(new Set());
});

test("a container runs its script, its files can be read, and it can be committed and removed", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);

  await runContainer("tj-prerun:aaaaaaaa", "tj-run-1", "mkdir -p /thunderjar && echo hi > /thunderjar/out.txt");

  expect(await readContainerFile("tj-run-1", "/thunderjar/out.txt")).toBe("hi\n");
  expect(await readContainerFile("tj-run-1", "/thunderjar/missing.txt")).toBeUndefined();
  await commitContainer("tj-run-1", "tj-postrun:x-1-1", "tj-prerun:aaaaaaaa");
  await removeContainer("tj-run-1");
  expect(await docker.images()).toEqual(["tj-prerun:aaaaaaaa", "tj-postrun:x-1-1"]);
  expect(await docker.containers()).toEqual([]);
});

test("runContainer throws a DockerContainerError with the reason when its script fails", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);

  const error = await runContainer("tj-prerun:aaaaaaaa", "tj-run-1", "echo nope >&2 && exit 4").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(DockerContainerError);
  expect((error as Error).message).toBe("nope");
});

test("readContainerFile throws a DockerContainerError when there's no such container", async () => {
  await using docker = await fakeDocker();
  Object.assign(Bun.env, docker.env);

  const error = await readContainerFile("tj-run-1", "/thunderjar/run.json").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(DockerContainerError);
  expect((error as Error).message).toBe("Error response from daemon: No such container: tj-run-1");
});

test("a started container holds its image's files, and runs commands, with input, however they exit", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);
  await runContainer("tj-prerun:aaaaaaaa", "tj-run-1", "echo hi > /workspace/a.txt");
  await commitContainer("tj-run-1", "tj-postrun:x-1-1", "tj-prerun:aaaaaaaa");
  await removeContainer("tj-run-1");

  await startContainer("tj-postrun:x-1-1", "tj-measure-1");

  expect(await execInContainer("tj-measure-1", "/workspace", ["cat", "a.txt"])).toEqual({ stdout: "hi\n", stderr: "", exitCode: 0 });
  expect(await execInContainer("tj-measure-1", "/workspace", ["sh", "-c", "cat; echo no >&2; exit 3"], "in\n")).toEqual({
    stdout: "in\n",
    stderr: "no\n",
    exitCode: 3,
  });
  await removeContainer("tj-measure-1");
  expect(await docker.containers()).toEqual([]);
});

test("execInContainer throws a DockerContainerError when there's no such container", async () => {
  await using docker = await fakeDocker();
  Object.assign(Bun.env, docker.env);

  const error = await execInContainer("tj-measure-1", "/workspace", ["true"]).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(DockerContainerError);
  expect((error as Error).message).toBe("Error response from daemon: No such container: tj-measure-1");
});
