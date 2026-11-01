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
    const image = `${REPOSITORY}:5650e1a8`;

    const first = await build(scenario("0202"), "example");

    expect(first.stderr).toBe("");
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe("Building <PREFIX>-prerun:5650e1a8 ... done\n1 built, 0 already present\n");
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

  test("0301 two-commits: /workspace is this repository at the code state's commit, detached, with nothing after it", async () => {
    // The project's two pinned commits, tagged fixture-0301-first and fixture-0301-second.
    const FIRST = "2dcf1912eb39b8b0ee181367b8564646886de132";
    const SECOND = "ad8a952bd73a86c85623d1fbd5da9723ecddc08d";
    const PROJECT = "fixtures/03_real_git/0301_git_project/project";

    const { stdout, stderr, exitCode } = await build(scenario("0301"), "two-commits");

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith("4 built, 0 already present\n");

    // Code state first, prompt set house-style-second.
    const first = `${REPOSITORY}:65a1cb99`;
    expect(await inImage(first, "pwd && git rev-parse HEAD && git rev-parse --abbrev-ref HEAD")).toBe(`/workspace\n${FIRST}\nHEAD`);
    expect(await inImage(first, "git remote && git for-each-ref")).toBe("");
    expect(await inImage(first, `git rev-list --all | grep -c ${SECOND} || true`)).toBe("0");
    expect(await inImage(first, `ls ${PROJECT} && cat ${PROJECT}/greet.js`)).toBe(
      `greet.js\npackage-lock.json\npackage.json\nprompts\n// Scenario 0301's project, at its first commit.\nexport const greet = () => "Hello!";`,
    );
    expect(await inImage(first, "head -1 HOUSE_STYLE.md")).toBe("# House style (second commit)");

    // Code state second, prompt set house-style-first.
    const second = `${REPOSITORY}:9417dc85`;
    expect(await inImage(second, "git rev-parse HEAD && git remote")).toBe(SECOND);
    expect(await inImage(second, `cat ${PROJECT}/farewell.js ${PROJECT}/greet.js`)).toBe(
      [
        "// Added at the project's second commit, so it isn't there at the first.",
        "export const farewell = (name) => `Goodbye, ${name}!`;",
        "// Scenario 0301's project, at its second commit.",
        "export const greet = (name) => `Hello, ${name}!`;",
      ].join("\n"),
    );
    expect(await inImage(second, "head -1 HOUSE_STYLE.md")).toBe("# House style (first commit)");
  }, 600_000);

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
});
