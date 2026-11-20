import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { FileChanges, MeasurementContext } from "../../api/declarations.ts";
import { TMP_DIR } from "../../testing/cli.ts";
import { filesChanged, filterByGlob, parseNameStatus, parseUntracked } from "./filesChanged.ts";

describe("parseNameStatus", () => {
  test("sorts NUL-separated status and path pairs into added, modified and deleted", () => {
    expect(parseNameStatus("A\0src/a.ts\0M\0README.md\0D\0old file.ts\0T\0link\0")).toEqual({
      added: ["src/a.ts"],
      modified: ["README.md", "link"],
      deleted: ["old file.ts"],
    });
  });

  test("reads nothing as no changes", () => {
    expect(parseNameStatus("")).toEqual({ added: [], modified: [], deleted: [] });
  });
});

describe("parseUntracked", () => {
  test("lists NUL-separated paths", () => {
    expect(parseUntracked("a.ts\0dir/b c.ts\0")).toEqual(["a.ts", "dir/b c.ts"]);
    expect(parseUntracked("")).toEqual([]);
  });
});

describe("filterByGlob", () => {
  const changes: FileChanges = { added: ["src/a.ts", "docs/a.md"], modified: ["src/b.ts"], deleted: ["docs/c.md"] };
  test("keeps only the matching paths", () => {
    expect(filterByGlob(changes, "src/**")).toEqual({ added: ["src/a.ts"], modified: ["src/b.ts"], deleted: [] });
  });
  test("keeps every path without a glob", () => {
    expect(filterByGlob(changes, undefined)).toEqual(changes);
  });
});

describe("filesChanged", () => {
  const sh = async (cwd: string, cmd: string) => {
    const r = await $`sh -c ${cmd}`.cwd(cwd).quiet().nothrow();
    return { stdout: r.stdout.toString(), stderr: r.stderr.toString(), exitCode: r.exitCode };
  };
  const ctxIn = (workdir: string) => ({ workdir, exec: (c: string) => sh(workdir, c) }) as unknown as MeasurementContext;
  const GIT = "git -c user.name=t -c user.email=t@t -c commit.gpgsign=false";

  test("reports committed, uncommitted, untracked and renamed files, but not ignored ones", async () => {
    const dir = `${TMP_DIR}/files-changed-${crypto.randomUUID().slice(0, 8)}`;
    await $`mkdir -p ${dir}`;
    await sh(dir, `git init -q && echo node_modules > .gitignore && echo a > keep.txt && echo b > edit.txt && echo c > gone.txt && echo d > old.txt && git add -A && ${GIT} commit -qm start && git update-ref refs/thunderjar/start HEAD`);
    await sh(dir, `echo 1 > committed.txt && git add -A && ${GIT} commit -qm c && git mv old.txt new.txt && git rm -q gone.txt && echo x >> edit.txt && echo u > untracked.txt && mkdir node_modules && echo i > node_modules/ignored.js`);
    const result = await filesChanged.evaluate({}, ctxIn(dir));
    expect(result).toEqual({
      outcome: "measured",
      data: { added: ["committed.txt", "new.txt", "untracked.txt"], modified: ["edit.txt"], deleted: ["gone.txt", "old.txt"] },
    });
    const only = await filesChanged.evaluate({ glob: "*.txt" }, ctxIn(dir));
    expect(only.outcome).toBe("measured");
  });

  test("fails in a workspace that isn't a git repository", async () => {
    const dir = `${TMP_DIR}/files-changed-${crypto.randomUUID().slice(0, 8)}`;
    await $`mkdir -p ${dir}`;
    // The scratch folder sits inside this repository: stop git looking above it.
    const ctx = { workdir: dir, exec: (c: string) => sh(dir, `GIT_CEILING_DIRECTORIES=$(dirname ${dir}) ${c}`) } as unknown as MeasurementContext;
    const result = await filesChanged.evaluate({}, ctx);
    expect(result.outcome).toBe("erroredWhileMeasuring");
    expect((result as { error: Error }).error.message).toContain("not a git repository");
  });
});
