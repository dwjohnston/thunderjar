// `thunderjar build`, through the CLI, with the fake Docker: real builds are in build.docker.test.ts.
// It only reads the project, so it runs on the scenarios unchanged. Any of these can be run by
// hand, e.g. `bun run fixture 0202 build example --dry-run`.
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const SNERK = `RUN echo "Write small functions, and say what each one is for." > /workspace/FAKE_INSTRUCTIONS.md`;
const GLURK = `RUN echo "Prefer one clear expression to a loop." > /workspace/FAKE_INSTRUCTIONS.md`;

/** What Thunderjar bakes into each image, after the harness's fragment: its model, its prompt and its run script. */
const BAKED = `COPY thunderjar/model.txt /thunderjar/model.txt
COPY thunderjar/prompt.txt /thunderjar/prompt.txt
COPY --chmod=755 thunderjar/thunderjar-run.sh /thunderjar/thunderjar-run.sh`;

/** The dry run's block for the prerun image of `hash`. */
const image = (hash: string, promptSet: string, harness: string, prefix = "thunderjar") => `# ${prefix}-prerun:${hash}
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
WORKDIR /workspace
${promptSet}
RUN echo "install ${harness}@1.0.0"
${BAKED}`;

describe("0202 typical project", () => {
  test("is-prime-baseline: each prerun image, in plan's order, then its Dockerfile", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    // Each permutation bakes in its own model and prompt, so each has its own image.
    expect(stdout).toBe(`${image("956de01a", SNERK, "fake-harness-alpha")}

${image("e7b564c7", SNERK, "fake-harness-alpha")}

${image("3eacad1a", SNERK, "fake-harness-beta")}

${image("04041169", SNERK, "fake-harness-beta")}

${image("d18f1820", GLURK, "fake-harness-alpha")}

${image("318809af", GLURK, "fake-harness-alpha")}

${image("84f6c383", GLURK, "fake-harness-beta")}

${image("97dda58b", GLURK, "fake-harness-beta")}
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
    expect(stdout).toBe(`${image("956de01a", SNERK, "fake-harness-alpha", "throwaway")}\n`);
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
      images: ["thunderjar-prerun:956de01a", "thunderjar-prerun:d18f1820"],
    });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const built = ["e7b564c7", "3eacad1a", "04041169", "318809af", "84f6c383", "97dda58b"];
    expect(stdout).toBe(`${built.map((hash) => `Building thunderjar-prerun:${hash} ... done\n`).join("")}6 built, 2 already present\n`);
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      ...built.map((hash) => `docker build -t thunderjar-prerun:${hash} <CONTEXT>`),
    ]);
  });

  test("a second build finds every image present, and builds nothing", async () => {
    await using docker = await fakeDocker();

    await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("0 built, 1 already present\n");
    expect((await commandsOf(docker)).filter((command) => command.startsWith("docker build"))).toEqual([
      "docker build -t thunderjar-prerun:956de01a <CONTEXT>",
    ]);
  });

  test("--image-prefix names the images it looks for and builds", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["build", "example", "--image-prefix", "throwaway"], {
      env: docker.env,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toBe("Building throwaway-prerun:956de01a ... done\n1 built, 0 already present\n");
    expect(await commandsOf(docker)).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} throwaway-prerun",
      "docker build -t throwaway-prerun:956de01a <CONTEXT>",
    ]);
  });

  test("a failed build is an error with Docker's reason, and nothing after it is built", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:3eacad1a"] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["build", "is-prime-baseline"], { env: docker.env });

    expect(stdout).toBe(`Building thunderjar-prerun:956de01a ... done
Building thunderjar-prerun:e7b564c7 ... done
Building thunderjar-prerun:3eacad1a ... failed
`);
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:3eacad1a failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
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
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:3eacad1a"] });

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
    expect(stdout).toBe(`# thunderjar-prerun:11a48c4d
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\
  && git config --system user.email agent@thunderjar.invalid
WORKDIR /workspace
RUN echo "install fake-harness-alpha@1.0.0"
${BAKED}
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
    expect(stdout.match(/^# .*$/gm)).toEqual(["# thunderjar-prerun:11a48c4d"]);
  });
});

describe("0208 parameter files", () => {
  test("a fragment copies from its own files/ folder, at ctx.dir", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0208"), ["build", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(`WORKDIR /workspace\nCOPY parameters/harness/scripts/ /opt/fake-scripted/\n${BAKED}\n`);
  });

  test("only each parameter's files/ folder goes into the build context", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0208"), ["build", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const image = (stdout.match(/^Building (\S+) \.\.\. done$/m) as RegExpMatchArray)[1] as string;
    const context = docker.contextOf(image);
    expect([...new Bun.Glob("**/*").scanSync({ cwd: context, dot: true })].toSorted()).toEqual([
      "Dockerfile",
      "parameters/harness/scripts/agent.sh",
      "thunderjar/model.txt",
      "thunderjar/prompt.txt",
      "thunderjar/thunderjar-run.sh",
    ]);
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
        "Error: .thunderjar/test-case-parameters/promptSets/trespasser/index.ts: applyParameter: uses another parameter's folder in the build context: the harness's, parameters/harness. A fragment can only use its own files/, through ctx.dir.\n",
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
  const PRERUN = "ghcr.io/acme/thunderjar-images:prerun-h11a48c4d";
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
    expect(stdout).toBe(`Building thunderjar-prerun:11a48c4d ... done
Pushing ${PRERUN} ... done
1 built, 0 already present, 1 pushed
`);
    expect(await commandsOf(docker)).toEqual([
      "docker login ghcr.io",
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      "docker build -t thunderjar-prerun:11a48c4d <CONTEXT>",
      `docker tag thunderjar-prerun:11a48c4d ${PRERUN}`,
      `docker push --quiet ${PRERUN}`,
    ]);
    expect(await docker.pushed()).toEqual([PRERUN]);
  });

  test("pushes a prerun image that's already present, so the store has it too", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:11a48c4d"] });

    const { stdout, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Pushing ${PRERUN} ... done\n0 built, 1 already present, 1 pushed\n`);
    expect(await docker.pushed()).toEqual([PRERUN]);
  });

  test("a push the registry refuses is an error, naming what the login needs", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], failing: [PRERUN] });

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["build", "example"], { env: docker.env });

    expect(stdout).toBe(`Building thunderjar-prerun:11a48c4d ... done\nPushing ${PRERUN} ... failed\n`);
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
