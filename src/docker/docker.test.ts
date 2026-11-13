// The Docker module, running the fake Docker in place of `docker`.
import { afterEach, expect, test } from "bun:test";
import { FAKE_DOCKER, fakeDocker } from "../testing/fakeDocker.ts";
import { $ } from "bun";
import { FIXTURES_DIR } from "../testing/scenario.ts";
import {
  buildFailureReason,
  buildImage,
  checkLogin,
  commitContainer,
  DockerBuildError,
  DockerContainerError,
  DockerLoginError,
  DockerPushError,
  DockerUnavailableError,
  imagesIn,
  pushImage,
  readContainerFile,
  reasonOf,
  removeContainer,
  runContainer,
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

test("runContainer stops waiting for a timed-out container it can't kill, and says it timed out", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"], failing: ["tj-run-1"] });
  Object.assign(Bun.env, docker.env);
  const startedAt = Date.now();

  const stop = await runContainer("tj-prerun:aaaaaaaa", "tj-run-1", "sleep 60", { timeoutSeconds: 1 });

  expect(stop.timedOut).toBe(true);
  // Three tries at `docker kill`, two seconds apart, not the script's minute.
  expect(Date.now() - startedAt).toBeLessThan(20_000);
  expect((await docker.commands()).filter((command) => command === "docker kill tj-run-1")).toHaveLength(3);
  await removeContainer("tj-run-1");
}, 30_000);

test("readContainerFile throws a DockerContainerError when there's no such container", async () => {
  await using docker = await fakeDocker();
  Object.assign(Bun.env, docker.env);

  const error = await readContainerFile("tj-run-1", "/thunderjar/run.json").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(DockerContainerError);
  expect((error as Error).message).toBe("Error response from daemon: No such container: tj-run-1");
});

test("checkLogin passes for a registry Docker holds a login for", async () => {
  await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
  Object.assign(Bun.env, docker.env);

  await checkLogin("ghcr.io");
  expect(await docker.commands()).toEqual(["docker login ghcr.io"]);
});

test("checkLogin throws a DockerLoginError, without prompting, for a registry with no login", async () => {
  await using docker = await fakeDocker();
  Object.assign(Bun.env, docker.env);

  const error = await checkLogin("ghcr.io").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DockerLoginError);
  expect((error as Error).message).toBe("Cannot perform an interactive login from a non TTY device");
});

test("checkLogin throws a DockerUnavailableError when the daemon can't be reached", async () => {
  await using docker = await fakeDocker({ unreachable: true });
  Object.assign(Bun.env, docker.env);

  await expect(checkLogin("ghcr.io")).rejects.toBeInstanceOf(DockerUnavailableError);
});

test("pushImage tags the image into the repository, then pushes it", async () => {
  await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);

  await pushImage("tj-prerun:aaaaaaaa", "ghcr.io/acme/images:prerun-haaaaaaaa");
  expect(await docker.commands()).toEqual([
    "docker tag tj-prerun:aaaaaaaa ghcr.io/acme/images:prerun-haaaaaaaa",
    "docker push --quiet ghcr.io/acme/images:prerun-haaaaaaaa",
  ]);
  expect(await docker.pushed()).toEqual(["ghcr.io/acme/images:prerun-haaaaaaaa"]);
});

test("pushImage throws a DockerPushError with the registry's reason", async () => {
  await using docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);

  const error = await pushImage("tj-prerun:aaaaaaaa", "ghcr.io/acme/images:prerun-haaaaaaaa").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DockerPushError);
  expect((error as Error).message).toStartWith("denied: ");
});

test("buildFailureReason adds the end of the failed step's output to Docker's last line", () => {
  const stderr = `#5 [2/7] RUN npm install --global bun@1.3.14
#5 71.42 npm error code EAI_AGAIN
#5 ERROR: process "/bin/sh -c npm install --global bun@1.3.14" did not complete successfully: exit code: 1
------
 > [2/7] RUN npm install --global bun@1.3.14:
71.42 npm error code EAI_AGAIN
71.42 npm error syscall getaddrinfo
71.42 npm error errno EAI_AGAIN
71.42 npm error request to https://registry.npmjs.org/bun failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org
71.42 npm error A complete log of this run can be found in: /root/.npm/_logs/debug-0.log
71.43 npm error and one more line
------
Dockerfile:2
--------------------
   2 | >>> RUN npm install --global bun@1.3.14
--------------------
ERROR: failed to build: failed to solve: process "/bin/sh -c npm install --global bun@1.3.14" did not complete successfully: exit code: 1
`;
  expect(buildFailureReason(stderr)).toBe(`ERROR: failed to build: failed to solve: process "/bin/sh -c npm install --global bun@1.3.14" did not complete successfully: exit code: 1
  npm error syscall getaddrinfo
  npm error errno EAI_AGAIN
  npm error request to https://registry.npmjs.org/bun failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org
  npm error A complete log of this run can be found in: /root/.npm/_logs/debug-0.log
  npm error and one more line`);
});

test("buildFailureReason is Docker's last line when no step's output is repeated", () => {
  expect(buildFailureReason("#1 load\nERROR: failed to build: secret id=npm: env NPM_TOKEN is not set\n")).toBe("ERROR: failed to build: secret id=npm: env NPM_TOKEN is not set");
  expect(buildFailureReason("")).toBe("");
});

test("reasonOf is the last line, unless the daemon couldn't be reached: then the line that says so", () => {
  expect(reasonOf("Unable to find image\nError response from daemon: pull access denied\n")).toBe("Error response from daemon: pull access denied");
  const unreachable = `error during connect: Get "http://docker.example.com/v1.56/images/json": command [ssh -T -- tjfly docker system dial-stdio] has exited with exit status 255: stderr=Error: app thunderjar-runtime has no started VMs.
It may be unhealthy or not have been deployed yet.
Try the following command to verify:

fly status
`;
  expect(reasonOf(unreachable)).toBe(
    'error during connect: Get "http://docker.example.com/v1.56/images/json": command [ssh -T -- tjfly docker system dial-stdio] has exited with exit status 255: stderr=Error: app thunderjar-runtime has no started VMs.',
  );
  expect(reasonOf(`error during connect: ${"x".repeat(900)}`)).toHaveLength(400);
});
