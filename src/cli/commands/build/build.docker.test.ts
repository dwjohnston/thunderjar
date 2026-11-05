// `thunderjar build` against real Docker. Skipped by `bun test`; run with `bun run test:docker`.
// Every image is named under a throwaway `--image-prefix`, and removed afterwards.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;
const REPOSITORY = `${PREFIX}-prerun`;

const build = (cwd: string, testCase: string) =>
  thunderjar(cwd, ["build", testCase, "--image-prefix", PREFIX], { docker: "real", paths: { "<PREFIX>": PREFIX } });

/** What `script` prints, run with sh in a throwaway container from `image`. */
const inImage = async (image: string, script: string) => (await $`docker run --rm ${image} sh -c ${script}`.text()).trim();

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("build, against real Docker", () => {
  afterAll(async () => {
    const images = (await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${REPOSITORY}`.text()).split("\n").filter(Boolean);
    if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
  });

  test("0202 example: builds the image from the fragments, and a second build finds it present", async () => {
    const image = `${REPOSITORY}:f64ca35b`;

    const first = await build(scenario("0202"), "example");

    expect(first.stderr).toBe("");
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe("Building <PREFIX>-prerun:f64ca35b ... done\n1 built, 0 already present\n");
    expect(await inImage(image, "pwd && cat FAKE_INSTRUCTIONS.md")).toBe(
      "/workspace\nWrite small functions, and say what each one is for.",
    );

    const second = await build(scenario("0202"), "example");

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe("0 built, 1 already present\n");
  });

  test("a fragment can COPY files from its parameter's folder, ctx.dir, with symlinks followed", async () => {
    await using copy = await copyScenarioProject("0201");
    const snerk = `${copy.dir}/.thunderjar/test-case-parameters/promptSets/snerk`;
    await Bun.write(`${copy.dir}/shared/AGENTS.md`, "# Snerk\n");
    await $`ln -s ../../../../shared/AGENTS.md ${snerk}/AGENTS.md`.quiet();
    await Bun.write(
      `${snerk}/index.ts`,
      `import { declarePromptSet } from "thunderjar";

export default declarePromptSet({
  applyParameter: (_config, ctx) => \`COPY \${ctx.dir}/AGENTS.md /workspace/AGENTS.md\`,
});
`,
    );

    const { stdout, stderr, exitCode } = await build(copy.dir, "example");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const image = (stdout.match(/^Building (\S+) \.\.\. done$/m) as RegExpMatchArray)[1] as string;
    expect(await inImage(image.replace("<PREFIX>", PREFIX), "cat /workspace/AGENTS.md")).toBe("# Snerk");
  });

  test("a failed build is an error with Docker's reason", async () => {
    await using copy = await copyScenarioProject("0201");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/promptSets/snerk/index.ts`,
      `import { declarePromptSet } from "thunderjar";

export default declarePromptSet({ applyParameter: () => "RUN exit 3" });
`,
    );

    const { stdout, stderr, exitCode } = await build(copy.dir, "example");

    expect(stdout).toMatch(/^Building <PREFIX>-prerun:\w{8} \.\.\. failed\n$/);
    expect(stderr).toMatch(/^Error: Building <PREFIX>-prerun:\w{8} failed: .*exit code: 3\n$/);
    expect(exitCode).toBe(1);
  });

  test("0207 image store: with no docker login for its registry, stops at once, without prompting, and builds nothing", async () => {
    // An empty Docker config: no stored login, whatever the machine running the tests has.
    const config = `${Bun.env.TMPDIR || "/tmp"}/tj-docker-config-${crypto.randomUUID()}`;
    // Its own prefix: the other tests' images are still present until afterAll.
    const prefix = `${PREFIX}-store`;
    await $`mkdir -p ${config}`.quiet();
    try {
      const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["build", "example", "--image-prefix", prefix], {
        docker: "real",
        env: { DOCKER_CONFIG: config },
      });

      expect(stdout).toBe("");
      expect(stderr).toMatch(/^Error: Can't push to ghcr\.io\/acme\/thunderjar-images: no valid Docker login for ghcr\.io \(.+\)\. Run `docker login ghcr\.io`\.\n$/);
      expect(exitCode).toBe(1);
      expect((await $`docker image ls --quiet ${`${prefix}-prerun`}`.text()).trim()).toBe("");
    } finally {
      await $`rm -rf ${config}`.quiet();
    }
  });
});
