// `codeStateGitCheckout` built by `thunderjar build` against real Docker, from a tag. Skipped by
// `bun test`; run with `bun run test:docker`. Needs the network, for GitHub.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;
const REPOSITORY = `${PREFIX}-prerun`;

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("codeStateGitCheckout, against real Docker", () => {
  afterAll(async () => {
    const images = (await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${REPOSITORY}`.text()).split("\n").filter(Boolean);
    if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
  });

  test("a tag is checked out at its commit, detached, with no origin", async () => {
    await using copy = await copyScenarioProject("0201");
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/codeStates/baseline/index.ts`,
      `import { codeStateGitCheckout } from "thunderjar";

export default codeStateGitCheckout({ repo: "https://github.com/dwjohnston/thunderjar.git", tag: "tj-thunderjar-start" });
`,
    );

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["build", "example", "--image-prefix", PREFIX], {
      docker: "real",
      paths: { "<PREFIX>": PREFIX },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const image = ((stdout.match(/^Building (\S+) \.\.\. done$/m) as RegExpMatchArray)[1] as string).replace("<PREFIX>", PREFIX);
    const inImage = async (script: string) => (await $`docker run --rm ${image} sh -c ${script}`.text()).trim();
    expect(await inImage("git -C /workspace rev-parse HEAD")).toBe("530f47780718b56122d2fce6a8d87011632cf546");
    expect(await inImage("git -C /workspace remote")).toBe("");
  });
});
