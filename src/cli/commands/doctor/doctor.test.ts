import { describe, expect, test } from "bun:test";
import { thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const REPOSITORY = "ghcr.io/acme/thunderjar-images";
const PROBE = `${REPOSITORY}:thunderjar-doctor`;
const REMOTE = "docker --context cloud";

describe("doctor", () => {
  test("0201, with no image store or runtime: says everything runs locally, and asks Docker nothing", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["doctor"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Config ... ok
Image store ... none: images stay in the local Docker daemon
Runtime ... none: containers run on the local Docker daemon
`);
    expect(await docker.commands()).toEqual([]);
  });

  test("0211 remote runtime: builds and pushes a probe locally, then pulls it through the runtime", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["doctor"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Config ... ok
Docker login for ${REPOSITORY} ... ok
Runtime: \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
  Building thunderjar-doctor:probe ... ok
  Pushing ${PROBE} ... ok
  Pulling through the runtime ${PROBE} ... ok
The runtime can run images from the image store.
`);
    const commands = await docker.commands();
    expect(commands.filter((command) => command.startsWith(REMOTE))).toEqual([`${REMOTE} pull --quiet ${PROBE}`]);
    expect(await docker.pushed()).toEqual([PROBE]);
  });

  test("0211, when the runtime can't pull: fails, saying what to check", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], pullDenied: true });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["doctor"], { env: docker.env });

    expect(stdout).toEndWith(`  Pulling through the runtime ${PROBE} ... failed\n`);
    expect(stderr).toBe(`Error: The runtime couldn't pull from the image store: Error response from daemon: pull access denied for ${PROBE}, repository does not exist or may require 'docker login'
Make sure the runtime can reach the registry and is logged in to it.
`);
    expect(exitCode).toBe(1);
  });

  test("0211, without a local docker login: fails before building anything", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["doctor"], { env: docker.env });

    expect(stdout).toBe(`Config ... ok\nDocker login for ${REPOSITORY} ... failed\n`);
    expect(stderr).toStartWith(`Error: Can't push to ${REPOSITORY}: no valid Docker login for ghcr.io`);
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual(["docker login ghcr.io"]);
  });
});
