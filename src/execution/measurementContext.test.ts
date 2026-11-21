// The measurement context, over the fake Docker: a measurement container from a postrun image
// the fake made by running and committing a container, as `run` does.
import { afterEach, describe, expect, test } from "bun:test";
import type { TranscriptDeclaration, TranscriptEvent, TranscriptFile } from "../api/declarations.ts";
import { commitContainer, DockerContainerError, removeContainer, runContainer } from "../docker/docker.ts";
import { fakeDocker } from "../testing/fakeDocker.ts";
import { openMeasurementContext } from "./measurementContext.ts";

const NO_REPLY = { outcome: "unavailable", reason: "its harness has no collectReply" } as const;
const RECORDED = { harnessResult: "", reply: NO_REPLY, replies: [NO_REPLY] };

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
    const ctx = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", { harnessResult: "the result", reply: NO_REPLY, replies: [NO_REPLY] });

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
    // One `docker run`, its shell sent each command: no `docker exec`, and no `docker rm`, as it removes itself.
    expect((await docker.commands()).filter((command) => command.includes("-measure-1"))[0]).toStartWith(
      "docker run --rm --interactive --name tj-run-x-1-1-measure-1 --pull never --entrypoint sh tj-postrun:x-1-1 -c ",
    );
    expect((await docker.commands()).filter((command) => / (exec|rm) /.test(command) && command.includes("-measure-"))).toEqual([]);
  });

  test("writes files, folders and all, which only that container sees", async () => {
    await using _ = await postrunImage("echo one > isPrime.ts");
    const first = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", RECORDED);
    try {
      await first.writeFile("src/deep/isPrime.test.ts", "it's 'quoted'\nand $HOME\n");
      expect(await first.readFile("src/deep/isPrime.test.ts")).toBe("it's 'quoted'\nand $HOME\n");
      expect(await first.glob("**/*.ts")).toEqual(["isPrime.ts", "src/deep/isPrime.test.ts"]);
    } finally {
      await first.close();
    }

    const second = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-2", RECORDED);
    try {
      expect(await second.glob("**/*.ts")).toEqual(["isPrime.ts"]);
    } finally {
      await second.close();
    }
  });

  test("throws a DockerContainerError, and leaves no container, when the container can't be started", async () => {
    await using docker = await fakeDocker();
    Object.assign(Bun.env, docker.env);

    const error = await openMeasurementContext("tj-postrun:missing", "tj-run-x-1-1-measure-1", RECORDED).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DockerContainerError);
    expect((error as Error).message).toBe("docker: Error response from daemon: No such image: tj-postrun:missing");
    expect(await docker.containers()).toEqual([]);
  });
});

describe("openMeasurementContext's transcript", () => {
  /** A transcript of sessions as JSON lines, one message per line, the lines of each file in turn. */
  const FAKE_TRANSCRIPT: TranscriptDeclaration = {
    files: ["~/.fake/sessions/**/*.jsonl"],
    parse: (files) =>
      files.flatMap(({ text }) =>
        text
          .split("\n")
          .filter(Boolean)
          .map((line): TranscriptEvent => ({ kind: "message", role: "assistant", text: (JSON.parse(line) as { said: string }).said, agent: "main" })),
      ),
  };
  /** The agent's session, in the image user's home: two files the glob matches, and one it doesn't. */
  const SESSION =
    `mkdir -p "$HOME/.fake/sessions/main/sub" && echo '{"said":"one"}' > "$HOME/.fake/sessions/main/a.jsonl"` +
    ` && printf '{"said":"two"}\\n{"said":"three"}\\n' > "$HOME/.fake/sessions/main/sub/b.jsonl" && echo nope > "$HOME/.fake/sessions/notes.txt"`;

  test("is unavailable, saying why, when its harness declares no transcript", async () => {
    await using _ = await postrunImage(SESSION);
    const ctx = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", RECORDED);
    try {
      expect(await ctx.transcript()).toEqual({ outcome: "unavailable", reason: "its harness declares no transcript" });
    } finally {
      await ctx.close();
    }
  });

  test("is parsed from every file its globs match in the postrun image, `~` being the home of the image's user", async () => {
    await using _ = await postrunImage(SESSION);
    const parsed: string[] = [];
    const transcript = { ...FAKE_TRANSCRIPT, parse: (files: TranscriptFile[]) => (parsed.push(...files.map(({ path }) => path)), FAKE_TRANSCRIPT.parse(files)) };
    const ctx = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", RECORDED, undefined, [], transcript);
    try {
      expect(await ctx.transcript()).toEqual({
        outcome: "collected",
        events: ["one", "two", "three"].map((text) => ({ kind: "message", role: "assistant", text, agent: "main" })),
      });
      // Absolute paths, sorted.
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEndWith("/.fake/sessions/main/a.jsonl");
      expect(parsed[1]).toEndWith("/.fake/sessions/main/sub/b.jsonl");
      expect(parsed[0]).toStartWith("/");
    } finally {
      await ctx.close();
    }
  });

  test("is unavailable, saying why, when no file matches its globs", async () => {
    await using _ = await postrunImage(`mkdir -p "$HOME/.fake" && echo nope > "$HOME/.fake/notes.txt"`);
    const ctx = await openMeasurementContext("tj-postrun:x-1-1", "tj-run-x-1-1-measure-1", RECORDED, undefined, [], FAKE_TRANSCRIPT);
    try {
      expect(await ctx.transcript()).toEqual({ outcome: "unavailable", reason: "no file matched its transcript's files: ~/.fake/sessions/**/*.jsonl" });
    } finally {
      await ctx.close();
    }
  });
});
