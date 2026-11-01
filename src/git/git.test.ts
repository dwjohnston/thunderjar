// Real git: reads this repository, at scenario 0301's pinned commits (tags fixture-0301-first and
// fixture-0301-second).
import { $ } from "bun";
import { describe, expect, test } from "bun:test";
import { REPO_ROOT } from "../testing/scenario.ts";
import { findRepository, type Repository } from "./git.ts";

const FIRST = "2dcf1912eb39b8b0ee181367b8564646886de132";
const SECOND = "ad8a952bd73a86c85623d1fbd5da9723ecddc08d";
const PROJECT = "fixtures/03_real_git/0301_git_project/project";

const repository = async () => (await findRepository(REPO_ROOT)) as Repository;

describe("findRepository", () => {
  test("is undefined outside a repository", async () => {
    expect(await findRepository("/")).toBeUndefined();
  });

  test("resolves a commit, full or abbreviated, and nothing else", async () => {
    const repo = await repository();

    expect(await repo.resolveCommit(FIRST)).toBe(FIRST);
    expect(await repo.resolveCommit(FIRST.slice(0, 10))).toBe(FIRST);
    expect(await repo.resolveCommit("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0")).toBeUndefined();
  });

  test("reads a file at a commit, not from the worktree", async () => {
    const repo = await repository();
    const text = async (commit: string, path: string) => {
      const content = await repo.readFile(commit, path);
      return content && new TextDecoder().decode(content);
    };

    expect(await text(FIRST, `${PROJECT}/prompts/house-style.md`)).toStartWith("# House style (first commit)\n");
    expect(await text(SECOND, `${PROJECT}/prompts/house-style.md`)).toStartWith("# House style (second commit)\n");
    expect(await text(FIRST, `${PROJECT}/farewell.js`)).toBeUndefined();
  });

  test("bundles a commit and its ancestors, and nothing after it, without writing to the repository", async () => {
    const repo = await repository();
    const dir = `${REPO_ROOT}/fixtures/.tmp/bundle-${crypto.randomUUID()}`;
    const refs = await $`git -C ${REPO_ROOT} for-each-ref`.text();

    try {
      await $`mkdir -p ${dir}`.quiet();
      await repo.bundle(FIRST, `${dir}/code.bundle`);
      await $`git clone --quiet ${dir}/code.bundle ${dir}/clone`.quiet();
      const history = (await $`git -C ${dir}/clone rev-list --all`.text()).split("\n");

      expect((await $`git -C ${dir}/clone rev-parse HEAD`.text()).trim()).toBe(FIRST);
      expect(history).not.toContain(SECOND);
      expect(await $`git -C ${REPO_ROOT} for-each-ref`.text()).toBe(refs);
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });
});
