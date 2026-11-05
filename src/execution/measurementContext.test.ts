// The measurement context, over the fake Docker: a measurement container from a postrun image
// the fake made by running and committing a container, as `run` does.
import { afterEach, describe, expect, test } from "bun:test";
import { commitContainer, DockerContainerError, removeContainer, runContainer } from "../docker/docker.ts";
import { fakeDocker } from "../testing/fakeDocker.ts";
import { openMeasurementContext } from "./measurementContext.ts";

const saved = { THUNDERJAR_DOCKER: Bun.env.THUNDERJAR_DOCKER, FAKE_DOCKER_DIR: Bun.env.FAKE_DOCKER_DIR };

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete Bun.env[name];
    else Bun.env[name] = value;
  }
});

/** The fake Docker, with a postrun image `tj-postrun:x-1-1` holding what `script` wrote. */
async function postrunImage(script: string) {
  const docker = await fakeDocker({ images: ["tj-prerun:aaaaaaaa"] });
  Object.assign(Bun.env, docker.env);
  await runContainer("tj-prerun:aaaaaaaa", "tj-run-x-1-1", script);
  await commitContainer("tj-run-x-1-1", "tj-postrun:x-1-1", "tj-prerun:aaaaaaaa");
  await removeContainer("tj-run-x-1-1");
  return docker;
}

describe("openMeasurementContext", () => {
  test("reads, globs and runs commands in a container from the postrun image, in /workspace", async () => {
    await using docker = await postrunImage("mkdir -p src && echo one > src/isPrime.ts && echo two > README.md && touch .hidden.ts");
    const ctx = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", "the result");

    try {
      expect(ctx.workdir).toBe("/workspace");
      expect(ctx.harnessResult).toBe("the result");
      expect(await ctx.glob("**/*.ts")).toEqual([".hidden.ts", "src/isPrime.ts"]);
      expect(await ctx.glob("**/isPrime.ts")).toEqual(["src/isPrime.ts"]);
      expect(await ctx.glob("*.ts")).toEqual([".hidden.ts"]);
      expect(await ctx.readFile("src/isPrime.ts")).toBe("one\n");
      expect(await ctx.exec("cat README.md; echo oops >&2; exit 4")).toEqual({ stdout: "two\n", stderr: "oops\n", exitCode: 4 });
      await expect(ctx.readFile("missing.ts")).rejects.toThrow(/^can't read missing\.ts: /);
    } finally {
      await ctx.close();
    }
    expect(await docker.containers()).toEqual([]);
    expect((await docker.commands()).filter((command) => command.includes("-measure-1"))[0]).toBe(
      "docker run --detach --name tj-run-x-1-1-measure-1 --pull never --entrypoint sh tj-postrun:x-1-1 -c exec sleep 2147483647",
    );
  });

  test("writes files, folders and all, which only that container sees", async () => {
    await using _ = await postrunImage("echo one > isPrime.ts");
    const first = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", "");
    try {
      await first.writeFile("src/deep/isPrime.test.ts", "it's 'quoted'\nand $HOME\n");
      expect(await first.readFile("src/deep/isPrime.test.ts")).toBe("it's 'quoted'\nand $HOME\n");
      expect(await first.glob("**/*.ts")).toEqual(["isPrime.ts", "src/deep/isPrime.test.ts"]);
    } finally {
      await first.close();
    }

    const second = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-2", "");
    try {
      expect(await second.glob("**/*.ts")).toEqual(["isPrime.ts"]);
    } finally {
      await second.close();
    }
  });

  test("throws a DockerContainerError, and leaves no container, when the container can't be started", async () => {
    await using docker = await fakeDocker();
    Object.assign(Bun.env, docker.env);

    const error = await openMeasurementContext("tj-postrun:missing", "tj-run-x-1-1-measure-1", "").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DockerContainerError);
    expect((error as Error).message).toBe("docker: Error response from daemon: No such image: tj-postrun:missing");
    expect(await docker.containers()).toEqual([]);
  });
});
