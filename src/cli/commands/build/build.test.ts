// `thunderjar build`, through the CLI, with the fake Docker: real builds are in build.docker.test.ts.
// It only reads the project, so it runs on the scenarios unchanged. Any of these can be run by
// hand, e.g. `bun run fixture 0202 build example --dry-run`.
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const SNERK = `RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md`;
const GLURK = `RUN echo "Prefer one clear expression to a loop." > /workspace/FAKE_INSTRUCTIONS.md`;

/** The dry run's block for the prerun image of `hash`. */
const image = (hash: string, promptSet: string, harness: string, prefix = "thunderjar") => `# ${prefix}-prerun:${hash}
FROM node:20-bookworm
WORKDIR /workspace
${promptSet}
RUN echo "install ${harness}@1.0.0"`;

describe("0202 typical project", () => {
  test("is-prime-baseline: each prerun image, in plan's order, then its Dockerfile", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${image("45bcf0be", SNERK, "fake-harness-alpha")}

${image("fc556cc9", SNERK, "fake-harness-alpha")}

${image("90abcb0a", SNERK, "fake-harness-beta")}

${image("775c8f66", SNERK, "fake-harness-beta")}

${image("cda1818b", GLURK, "fake-harness-alpha")}

${image("67844e9a", GLURK, "fake-harness-alpha")}

${image("df1934bd", GLURK, "fake-harness-beta")}

${image("f4979542", GLURK, "fake-harness-beta")}
`);
  });

  test("asks Docker nothing, so builds nothing, even when Docker can't be reached", async () => {
    await using docker = await fakeDocker({ unreachable: true });

    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"], {
      env: docker.env,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await docker.commands()).toEqual([]);
  });

  test("--image-prefix starts every image name with it", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), [
      "build",
      "example",
      "--dry-run",
      "--image-prefix",
      "throwaway",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${image("45bcf0be", SNERK, "fake-harness-alpha", "throwaway")}\n`);
  });

  test("an --image-prefix Docker wouldn't accept is an error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), [
      "build",
      "example",
      "--dry-run",
      "--image-prefix",
      "Throw/away",
    ]);

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "error: option '--image-prefix <name>' argument 'Throw/away' is invalid. It must be lowercase letters and digits, joined by single separators (., _, __ or -), as a Docker repository name is.\n",
    );
    expect(exitCode).toBe(1);
  });

  test("an unknown test case is a configuration error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "missing", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });
});

describe("0202 typical project, building with the fake Docker", () => {
  /** The commands the fake was given, with each build context's temporary path replaced. */
  const commandsOf = async (docker: FakeDocker) =>
    (await docker.commands()).map((command) => command.replace(/ \S+\/thunderjar-build-[\w-]+$/, " <CONTEXT>"));

  test("builds only the missing prerun images, in plan's order, then counts them", async () => {
    await using docker = await fakeDocker({
      images: ["thunderjar-prerun:45bcf0be", "thunderjar-prerun:cda1818b", "thunderjar-prerun:f4979542"],
    });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Building thunderjar-prerun:fc556cc9 ... done
Building thunderjar-prerun:90abcb0a ... done
Building thunderjar-prerun:775c8f66 ... done
Building thunderjar-prerun:67844e9a ... done
Building thunderjar-prerun:df1934bd ... done
5 built, 3 already present
`);
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      "docker build -t thunderjar-prerun:fc556cc9 <CONTEXT>",
      "docker build -t thunderjar-prerun:90abcb0a <CONTEXT>",
      "docker build -t thunderjar-prerun:775c8f66 <CONTEXT>",
      "docker build -t thunderjar-prerun:67844e9a <CONTEXT>",
      "docker build -t thunderjar-prerun:df1934bd <CONTEXT>",
    ]);
  });

  test("a second build finds every image present, and builds nothing", async () => {
    await using docker = await fakeDocker();

    await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("0 built, 1 already present\n");
    expect((await commandsOf(docker)).filter((command) => command.startsWith("docker build"))).toEqual([
      "docker build -t thunderjar-prerun:45bcf0be <CONTEXT>",
    ]);
  });

  test("--image-prefix names the images it looks for and builds", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example", "--image-prefix", "throwaway"], {
      env: docker.env,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("Building throwaway-prerun:45bcf0be ... done\n1 built, 0 already present\n");
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} throwaway-prerun",
      "docker build -t throwaway-prerun:45bcf0be <CONTEXT>",
    ]);
  });

  test("a failed build is an error with Docker's reason, and nothing after it is built", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:fc556cc9"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stdout).toBe(`Building thunderjar-prerun:45bcf0be ... done
Building thunderjar-prerun:fc556cc9 ... failed
`);
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:fc556cc9 failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
    );
    expect(exitCode).toBe(1);
    expect((await commandsOf(docker)).filter((command) => command.startsWith("docker build"))).toHaveLength(2);
  });

  test("when Docker can't be reached, it's an error, and nothing is built", async () => {
    await using docker = await fakeDocker({ unreachable: true });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "Error: Docker can't be reached, so no image can be built: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(1);
    expect(await commandsOf(docker)).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun"]);
  });

  test("builds each image from a context outside the project, removed afterwards, even when its build fails", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:fc556cc9"] });

    await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    const contexts = (await docker.commands()).filter((command) => command.startsWith("docker build")).map((command) => command.split(" ").at(-1) as string);
    expect(contexts).toHaveLength(2);
    for (const context of contexts) {
      expect(context).toStartWith(`${TMP_DIR}/thunderjar-build-`);
      expect(await $`test -d ${context}`.nothrow().quiet()).toHaveProperty("exitCode", 1);
    }
  });
});

describe("0201 minimal existing setup", () => {
  test("example: its one prerun image", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["build", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`# thunderjar-prerun:e943919c
FROM node:20-bookworm
WORKDIR /workspace
RUN echo "install fake-harness-alpha@1.0.0"
`);
  });

  test("permutations with the same hash share one image, printed once", async () => {
    await using copy = await copyScenarioProject("0201");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-cases/twice.ts`,
      (await Bun.file(`${copy.dir}/.thunderjar/test-cases/example.ts`).text()).replace(
        'promptSet: ["snerk"]',
        'promptSet: ["snerk", "snerk"]',
      ),
    );

    const plan = await thunderjar(copy.dir, ["plan", "twice"]);
    const { stdout, exitCode } = await thunderjar(copy.dir, ["build", "twice", "--dry-run"]);

    expect(plan.stdout).toContain("(2 permutations)");
    expect(exitCode).toBe(0);
    expect(stdout.match(/^# .*$/gm)).toEqual(["# thunderjar-prerun:e943919c"]);
  });
});

describe("0301 git project: real git", () => {
  // The project's two pinned commits, tagged fixture-0301-first and fixture-0301-second.
  const FIRST = "2dcf1912eb39b8b0ee181367b8564646886de132";
  const SECOND = "ad8a952bd73a86c85623d1fbd5da9723ecddc08d";
  const PROJECT = "fixtures/03_real_git/0301_git_project/project";

  /** The dry run's block for the prerun image of `hash`. */
  const gitImage = (hash: string, codeState: string, promptSet: string) => `# thunderjar-prerun:${hash}
FROM node:20-bookworm
COPY code.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${codeState} \\
  && git -C /workspace branch --quiet --delete --force code-state \\
  && git -C /workspace remote remove origin \\
  && git -C /workspace config user.name "Thunderjar agent" \\
  && git -C /workspace config user.email agent@thunderjar.invalid \\
  && rm /tmp/code.bundle
WORKDIR /workspace
RUN cd ${PROJECT} && npm ci --no-audit --no-fund
COPY git/${promptSet}/${PROJECT}/prompts/house-style.md /workspace/HOUSE_STYLE.md
RUN echo "install fake-harness-alpha@1.0.0"`;

  const UNPUSHED = `Error: commit a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 (code state "unpushed") is not in this repository.
Fetch it, or check that it has been pushed.
`;

  test("two-commits: Thunderjar checks out each code state's commit straight after the base image", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0301"), ["build", "two-commits", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`${gitImage("f42bd87a", FIRST, FIRST)}

${gitImage("65a1cb99", FIRST, SECOND)}

${gitImage("9417dc85", SECOND, FIRST)}

${gitImage("cc8c940e", SECOND, SECOND)}
`);
  });

  test("a prompt file is read at its prompt set's commit, never from the worktree", async () => {
    await using docker = await fakeDocker();

    const { stderr, exitCode } = await thunderjar(scenario("0301"), ["build", "two-commits"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const promptFile = (image: string, commit: string) =>
      Bun.file(`${docker.contextOf(`thunderjar-prerun:${image}`)}/git/${commit}/${PROJECT}/prompts/house-style.md`).text();
    expect(await promptFile("f42bd87a", FIRST)).toBe("# House style (first commit)\n\nWrite small functions.\n");
    expect(await promptFile("65a1cb99", SECOND)).toBe("# House style (second commit)\n\nWrite small functions, and name every parameter.\n");
    expect(await Bun.file(`${scenario("0301")}/prompts/house-style.md`).text()).toStartWith("# House style (worktree)\n");
  });

  test("a code state's bundle holds its commit and what came before it, and nothing after", async () => {
    await using docker = await fakeDocker();
    await thunderjar(scenario("0301"), ["build", "two-commits"], { env: docker.env });
    const clone = `${TMP_DIR}/clone-${crypto.randomUUID()}`;

    try {
      await $`git clone --quiet ${docker.contextOf("thunderjar-prerun:f42bd87a")}/code.bundle ${clone}`.quiet();
      const history = (await $`git -C ${clone} rev-list --all`.text()).split("\n");

      expect((await $`git -C ${clone} rev-parse HEAD`.text()).trim()).toBe(FIRST);
      expect(history).toContain(FIRST);
      expect(history).not.toContain(SECOND);
      expect(await Bun.file(`${clone}/${PROJECT}/greet.js`).text()).toBe(
        `// Scenario 0301's project, at its first commit.\nexport const greet = () => "Hello!";\n`,
      );
      expect(await Bun.file(`${clone}/${PROJECT}/farewell.js`).exists()).toBe(false);
      expect(await Bun.file(`${scenario("0301")}/greet.js`).text()).toContain("in the worktree");
    } finally {
      await $`rm -rf ${clone}`.quiet();
    }
  });

  test("unpushed-commit: a commit this repository doesn't have stops the build before anything is built", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0301"), ["build", "unpushed-commit"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(UNPUSHED);
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker build"))).toEqual([]);
  });

  test("unpushed-commit: the dry run stops at the missing commit too", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0301"), ["build", "unpushed-commit", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(UNPUSHED);
    expect(exitCode).toBe(1);
  });
});
