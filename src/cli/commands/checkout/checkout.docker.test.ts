/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar checkout` against real Docker: a copy of 0202, made a git repository of its own, is
// run with its fake agents, and a run checked out to a branch, whose tree is compared with the
// postrun image's workspace. Skipped by `bun test`; run with `bun run test:docker`. Every image and
// container is named under a throwaway `--image-prefix`, and removed afterwards.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { abbreviateHash } from "../../../config/permutations.ts";
import { sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar } from "../../../testing/cli.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;

const lines = (text: string) => text.split("\n").filter(Boolean);

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("checkout, against real Docker", () => {
  let copy: ProjectCopy | undefined;
  afterAll(async () => {
    const containers = lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text());
    if (containers.length > 0) await $`docker rm --force ${containers}`.quiet();
    const images = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} --filter ${`reference=${PREFIX}-*`}`.text());
    if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
    await copy?.remove();
  });

  test("0202 two-harnesses: a run checked out is a branch whose tree is its postrun workspace", async () => {
    copy = await copyScenarioProject("0202");
    const dir = copy.dir;
    await $`git init --quiet && git add --all && git -c user.name=test -c user.email=test@example.com commit --quiet -m project`.cwd(dir).quiet();
    const options = { docker: "real" as const, env: { FAKE_HARNESS_KEY: "fake-key" }, paths: { "<PREFIX>": PREFIX } };
    const ran = await thunderjar(dir, ["run", "two-harnesses", "--image-prefix", PREFIX], options);
    expect(ran.exitCode, ran.stdout + ran.stderr).toBe(0);
    const [execution] = await sqliteStore(`${dir}/.thunderjar/.data/runs.sqlite`).listExecutions();
    const [run] = await sqliteStore(`${dir}/.thunderjar/.data/runs.sqlite`).containerRunsOf(execution!.executionId);
    const hash = abbreviateHash(run!.permutationHash);

    const { stdout, stderr, exitCode } = await thunderjar(dir, ["checkout", `${run!.executionId}-h${hash}-i00`], options);
    expect({ stdout, stderr, exitCode }).toEqual({ stdout: `Checked out thunderjar/run/two-harnesses/<ULID>/h${hash}-i00\n`, stderr: "", exitCode: 0 });
    expect((await $`git branch --show-current`.cwd(dir).text()).trim()).toBe(`thunderjar/run/two-harnesses/${run!.executionId}/h${hash}-i00`);

    // The branch's files are the workspace's, as the agent left them.
    const inWorkspace = (script: string) => $`docker run --rm --entrypoint sh ${run!.postrunImage} -c ${script}`.text();
    const workspaceFiles = lines(await inWorkspace("find . -type f | sed 's,^\\./,,' | sort"));
    expect(lines(await $`git ls-tree -r --name-only HEAD`.cwd(dir).text()).toSorted()).toEqual(workspaceFiles);
    expect(workspaceFiles).toContain("isPrime.ts");
    expect(await $`git show HEAD:isPrime.ts`.cwd(dir).text()).toBe(await inWorkspace("cat isPrime.ts"));
  });
});
