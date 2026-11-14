// `thunderjar build`, through the CLI, with the fake Docker: real builds are in build.docker.test.ts.
// It only reads the project, so it runs on the scenarios unchanged. Any of these can be run by
// hand, e.g. `bun run fixture 0202 build example --dry-run`.
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { writeModel, writePrompt, writeRunScript } from "../../../api/files.ts";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const SNERK = `RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md`;
const GLURK = `RUN echo "Prefer one clear expression to a loop." > /workspace/FAKE_INSTRUCTIONS.md`;

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
const TERSE = "isPrime.ts: export a primality test.";
const MODELS: Record<string, string> = { "fake-harness-alpha": "fake-model-small-001", "fake-harness-beta": "fake-model-large-001" };

/** The start of the dry run's block for the prerun image of `hash`, up to its harness's install. */
const head = (hash: string, promptSet: string, harness: string, prefix = "thunderjar") => `# ${prefix}-prerun:${hash}
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
WORKDIR /workspace
${promptSet}
RUN echo "install ${harness}@1.0.0"
`;

/**
 * Checks the dry run's block for an image: its head, then the harness writing its model and run
 * script, then the initial prompt writing its prompt.
 */
const expectImage = (block: string, hash: string, promptSet: string, harness: string, prompt: string, prefix?: string) => {
  expect(block).toStartWith(`${head(hash, promptSet, harness, prefix)}${writeModel(MODELS[harness] as string)}\n${"COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh"}\n`);
  expect(block).toEndWith(`THUNDERJAR_EOF\n${writePrompt(prompt)}`);
};

describe("0202 typical project", () => {
  test("is-prime-baseline: each prerun image, in plan's order, then its Dockerfile", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // Each permutation writes its own model and prompt into its image, so each has its own.
    const blocks = stdout.trimEnd().split("\n\n");
    const expected: [string, string, string, string][] = [
      ["32a1d048", SNERK, "fake-harness-alpha", PLAIN],
      ["6aeed656", SNERK, "fake-harness-alpha", TERSE],
      ["577ed2bd", SNERK, "fake-harness-beta", PLAIN],
      ["6eec2774", SNERK, "fake-harness-beta", TERSE],
      ["59e77cba", GLURK, "fake-harness-alpha", PLAIN],
      ["2bdf2008", GLURK, "fake-harness-alpha", TERSE],
      ["341adb24", GLURK, "fake-harness-beta", PLAIN],
      ["43876a6a", GLURK, "fake-harness-beta", TERSE],
    ];
    expect(blocks).toHaveLength(expected.length);
    expected.forEach(([hash, promptSet, harness, prompt], i) => expectImage(blocks[i] as string, hash, promptSet, harness, prompt));
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
    expectImage(stdout.trimEnd(), "32a1d048", SNERK, "fake-harness-alpha", PLAIN, "throwaway");
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

/** The commands the fake was given, with each build context's temporary path replaced. */
const commandsOf = async (docker: FakeDocker) =>
  (await docker.commands()).map((command) => command.replace(/ \S+\/thunderjar-build-[\w-]+$/, " <CONTEXT>"));

describe("0202 typical project, building with the fake Docker", () => {

  test("builds only the missing prerun images, in plan's order, then counts them", async () => {
    await using docker = await fakeDocker({
      images: ["thunderjar-prerun:32a1d048", "thunderjar-prerun:59e77cba"],
    });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const built = ["6aeed656", "577ed2bd", "6eec2774", "2bdf2008", "341adb24", "43876a6a"];
    expect(stdout).toBe(`${built.map((hash) => `Building thunderjar-prerun:${hash} ... done\n`).join("")}6 built, 2 already present\n`);
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      ...built.map((hash) => `docker build -t thunderjar-prerun:${hash} <CONTEXT>`),
    ]);
  });

  test("with build concurrency 2, builds two at once, writing a line as each starts and ends", async () => {
    await using copy = await copyScenarioProject("0202");
    const config = `${copy.dir}/.thunderjar/thunderjar.config.ts`;
    await Bun.write(config, (await Bun.file(config).text()).replace("  runDataStore:", "  build: { concurrency: 2 },\n  runDataStore:"));
    const images = ["32a1d048", "59e77cba", "6aeed656", "577ed2bd", "6eec2774", "2bdf2008", "341adb24", "43876a6a"].map((hash) => `thunderjar-prerun:${hash}`);
    await using docker = await fakeDocker({ slow: images });

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["build", "is-prime-baseline"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const lines = stdout.trimEnd().split("\n");
    // The first two start before either ends.
    expect(lines.slice(0, 2).every((line) => line.startsWith("Building "))).toBe(true);
    expect(lines.filter((line) => line.startsWith("Built ")).sort()).toEqual(images.map((image) => `Built ${image}`).sort());
    expect(lines.at(-1)).toBe("8 built, 0 already present");
  });

  test("a second build finds every image present, and builds nothing", async () => {
    await using docker = await fakeDocker();

    await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("0 built, 1 already present\n");
    expect((await commandsOf(docker)).filter((command) => command.startsWith("docker build"))).toEqual([
      "docker build -t thunderjar-prerun:32a1d048 <CONTEXT>",
    ]);
  });

  test("--image-prefix names the images it looks for and builds", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example", "--image-prefix", "throwaway"], {
      env: docker.env,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("Building throwaway-prerun:32a1d048 ... done\n1 built, 0 already present\n");
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} throwaway-prerun",
      "docker build -t throwaway-prerun:32a1d048 <CONTEXT>",
    ]);
  });

  test("a failed build is an error with Docker's reason, and nothing after it is built", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:577ed2bd"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stdout).toBe(`Building thunderjar-prerun:32a1d048 ... done
Building thunderjar-prerun:6aeed656 ... done
Building thunderjar-prerun:577ed2bd ... failed
`);
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:577ed2bd failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
    );
    expect(exitCode).toBe(1);
    expect((await commandsOf(docker)).filter((command) => command.startsWith("docker build"))).toHaveLength(3);
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
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:577ed2bd"] });

    await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    const contexts = (await docker.commands()).filter((command) => command.startsWith("docker build")).map((command) => command.split(" ").at(-1) as string);
    expect(contexts).toHaveLength(3);
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
    expect(stdout).toBe(`# thunderjar-prerun:77e9dd16
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\
  && git config --system user.email agent@thunderjar.invalid
WORKDIR /workspace
RUN echo "install fake-harness-alpha@1.0.0"
${writeModel("fake-model-small-001")}
${writeRunScript(`printf '%s\\n' "// $(cat /thunderjar/prompt.txt)" '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"fake-model-small-001"}' > /thunderjar/result.json`)}
${writePrompt(PLAIN)}
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
    expect(stdout.match(/^# .*$/gm)).toEqual(["# thunderjar-prerun:77e9dd16"]);
  });
});

describe("0208 parameter files", () => {
  test("a fragment copies from its own files/ folder, at ctx.dir", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0208"), ["build", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("WORKDIR /workspace\nCOPY parameters/harness/scripts/ /opt/fake-scripted/\n");
  });

  test("only each parameter's files/ folder goes into the build context", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0208"), ["build", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const image = (stdout.match(/^Building (\S+) \.\.\. done$/m) as RegExpMatchArray)[1] as string;
    const context = docker.contextOf(image);
    expect([...new Bun.Glob("**/*").scanSync({ cwd: context, dot: true })].toSorted()).toEqual(["Dockerfile", "parameters/harness/scripts/agent.sh"]);
    expect(await Bun.file(`${context}/parameters/harness/scripts/agent.sh`).text()).toStartWith("#!/bin/sh\n");
  });
});

describe("0402 broken declarations", () => {
  test("a fragment naming another parameter's folder in the build context is a config error, and nothing is built", async () => {
    await using docker = await fakeDocker();

    for (const args of [["--dry-run"], []]) {
      const { stdout, stderr, exitCode } = await thunderjar(scenario("0402"), ["build", "trespassing-prompt-set", ...args], { env: docker.env });

      expect(stdout).toBe("");
      expect(stderr).toBe(
        "Error: .thunderjar/parameters/promptSets/trespasser/index.ts: applyParameter: uses another parameter's folder in the build context: the harness's, parameters/harness. A fragment can only use its own files/, through ctx.dir.\n",
      );
      expect(exitCode).toBe(1);
    }
    expect((await docker.commands()).filter((command) => command.startsWith("docker build"))).toEqual([]);
  });
});

describe("0209 floating code state", () => {
  test("the Dockerfile pins the commit the code state resolved to", async () => {
    await using git = await fakeCommand("git", { stdout: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a\trefs/heads/main" });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0209"), ["build", "follow-main", "--dry-run"], { env: git.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`WORKDIR /workspace
RUN git clone --quiet https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git /workspace \\
  && git -C /workspace checkout --quiet --detach 24dc11c26e2716a12cf33b82fec895a7f02b3e8a \\
  && git -C /workspace remote remove origin
`);
  });
});

describe("0402 broken declarations, resolving", () => {
  test("a resolve that throws is a config error naming the parameter, and nothing is built", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0402"), ["build", "unresolvable-code-state"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: code state "unresolvable": resolve threw: no branch named no-such-branch\n');
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("0210 build secrets", () => {
  const TOKEN = { GITHUB_TOKEN: "ghp_not-a-real-token" };

  test("each build is given the config's secrets and the SSH agent, and the secret's value is nowhere in its context", async () => {
    await using docker = await fakeDocker();

    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["build", "example"], { env: { ...docker.env, ...TOKEN } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [build] = (await commandsOf(docker)).filter((command) => command.startsWith("docker build"));
    expect(build).toMatch(/^docker build --secret id=github,env=GITHUB_TOKEN --ssh default -t thunderjar-prerun:[0-9a-f]{8} <CONTEXT>$/);
    const context = docker.contextOf(build!.split(" ").at(-2) as string);
    expect(await Bun.file(`${context}/Dockerfile`).text()).toContain("RUN --mount=type=secret,id=github \\\n");
    expect((await $`grep -r ${TOKEN.GITHUB_TOKEN} ${context}`.nothrow().quiet()).exitCode).toBe(1);
  });

  test("without the secret's variable, it stops before Docker is asked anything", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0210"), ["build", "example"], { env: { ...docker.env, GITHUB_TOKEN: "" } });

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: Build secret "github" needs GITHUB_TOKEN, which is not set.\nExport it in the shell that runs thunderjar.\n');
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });

  test("the dry run needs no secret: nothing is built", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["build", "example", "--dry-run"], { env: { GITHUB_TOKEN: "" } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });
});

describe("0207 image store", () => {
  const PRERUN = "ghcr.io/acme/thunderjar-images:prerun-h77e9dd16";
  const NOT_LOGGED_IN =
    "Error: Can't push to ghcr.io/acme/thunderjar-images: no valid Docker login for ghcr.io (Cannot perform an interactive login from a non TTY device). Run `docker login ghcr.io`.\n";

  test("without a docker login for the registry, stops before anything is built", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(NOT_LOGGED_IN);
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual(["docker login ghcr.io"]);
  });

  test("builds each prerun image, then pushes it to the image store, tagged prerun-h<hash>", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Building thunderjar-prerun:77e9dd16 ... done
Pushing ${PRERUN} ... done
1 built, 0 already present, 1 pushed
`);
    expect(await commandsOf(docker)).toEqual([
      "docker login ghcr.io",
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      "docker build -t thunderjar-prerun:77e9dd16 <CONTEXT>",
      `docker tag thunderjar-prerun:77e9dd16 ${PRERUN}`,
      `docker push --quiet ${PRERUN}`,
    ]);
    expect(await docker.pushed()).toEqual([PRERUN]);
  });

  test("pushes a prerun image that's already present, so the store has it too", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:77e9dd16"] });

    const { stdout, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Pushing ${PRERUN} ... done\n0 built, 1 already present, 1 pushed\n`);
    expect(await docker.pushed()).toEqual([PRERUN]);
  });

  test("a push the registry refuses is an error, naming what the login needs", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [PRERUN] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(stdout).toBe(`Building thunderjar-prerun:77e9dd16 ... done\nPushing ${PRERUN} ... failed\n`);
    expect(stderr).toBe(`Error: Pushing ${PRERUN} failed: denied: permission_denied: The token provided does not match expected scopes.
Check that your Docker login for ghcr.io can push to ghcr.io/acme/thunderjar-images: on ghcr.io, a token needs the write:packages scope.
`);
    expect(exitCode).toBe(1);
    expect(await docker.pushed()).toEqual([]);
  });

  test("--dry-run needs no login", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0207"), ["build", "example", "--dry-run"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("0211 remote runtime", () => {
  const PRERUN = "ghcr.io/acme/thunderjar-images:prerun-h77e9dd16";
  const REMOTE = "docker --context cloud";

  test("builds each prerun image on the runtime, and pushes it from there: nothing is built here", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0211"), ["build", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Building with \`<REPO>/src/testing/fakeDocker.ts --context cloud\`
Building thunderjar-prerun:77e9dd16 ... done
Pushing ${PRERUN} ... done
1 built, 0 already present, 1 pushed
`);
    expect(await commandsOf(docker)).toEqual([
      "docker login ghcr.io",
      `${REMOTE} image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun`,
      `${REMOTE} build -t thunderjar-prerun:77e9dd16 <CONTEXT>`,
      `${REMOTE} tag thunderjar-prerun:77e9dd16 ${PRERUN}`,
      `${REMOTE} push --quiet ${PRERUN}`,
    ]);
  });

  test("--local builds on the local Docker daemon, and pushes from there", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });

    const { stdout, exitCode } = await thunderjar(scenario("0211"), ["build", "example", "--local"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("Building with");
    expect(await commandsOf(docker)).toEqual([
      "docker login ghcr.io",
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      "docker build -t thunderjar-prerun:77e9dd16 <CONTEXT>",
      `docker tag thunderjar-prerun:77e9dd16 ${PRERUN}`,
      `docker push --quiet ${PRERUN}`,
    ]);
  });
});

describe("--json", () => {
  test("prints the images built and already present as JSON, with its progress on stderr", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "example", "--json"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ built: ["thunderjar-prerun:32a1d048"], present: [], pushed: [] });
    expect(stderr).toBe("Building thunderjar-prerun:32a1d048 ... done\n");
  });

  test("a failed build is an error on stderr, with nothing on stdout", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:577ed2bd"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--json"], { env: docker.env });

    expect({ stdout, exitCode }).toEqual({ stdout: "", exitCode: 1 });
    expect(stderr).toContain("Error: Building thunderjar-prerun:577ed2bd failed");
  });

  test("--dry-run prints each prerun image and its Dockerfile as JSON", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "example", "--dry-run", "--json"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual([{ prerunImage: "thunderjar-prerun:32a1d048", dockerfile: expect.stringContaining("FROM ") }]);
  });
});
