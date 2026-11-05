// The Docker module, running the fake Docker in place of `docker`.
import { afterEach, expect, test } from "bun:test";
import { FAKE_DOCKER, fakeDocker } from "../testing/fakeDocker.ts";
import { DockerUnavailableError, imagesIn } from "./docker.ts";

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
