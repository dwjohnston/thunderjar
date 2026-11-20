import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import type { Commit, MeasurementContext } from "../../api/declarations.ts";
import { TMP_DIR } from "../../testing/cli.ts";
import { commits, parseGitLog } from "./commits.ts";

describe("parseGitLog", () => {
  test("reads each commit's sha, whole message and files, sorted into added, modified and deleted", () => {
    const output = [
      "\x01aaa111\x02🔴 Test: add\n\nbody line\n\x03\0A\0src/a.test.ts\0",
      "\x01bbb222\x02🟢 Add a\n\x03\0A\0src/a.ts\0M\0README.md\0D\0old file.ts\0T\0link\0",
      "\x01ccc333\x02empty commit\n\x03",
    ].join("");
    expect(parseGitLog(output)).toEqual([
      { sha: "aaa111", message: "🔴 Test: add\n\nbody line", files: { added: ["src/a.test.ts"], modified: [], deleted: [] } },
      { sha: "bbb222", message: "🟢 Add a", files: { added: ["src/a.ts"], modified: ["README.md", "link"], deleted: ["old file.ts"] } },
      { sha: "ccc333", message: "empty commit", files: { added: [], modified: [], deleted: [] } },
    ]);
  });
});

describe("commits", () => {
  const sh = async (cwd: string, cmd: string) => {
    const r = await $`sh -c ${cmd}`.cwd(cwd).quiet().nothrow();
    return { stdout: r.stdout.toString(), stderr: r.stderr.toString(), exitCode: r.exitCode };
  };
  const ctxIn = (workdir: string) => ({ workdir, exec: (c: string) => sh(workdir, c) }) as unknown as MeasurementContext;
  const GIT = "git -c user.name=t -c user.email=t@t -c commit.gpgsign=false";

  test("lists the commits since refs/thunderjar/start, oldest first, with their files", async () => {
    const dir = `${TMP_DIR}/commits-${crypto.randomUUID()}`;
    await $`mkdir -p ${dir}`.quiet();
    try {
      await sh(dir, `git init -q && echo a > keep.txt && echo b > gone.txt && git add -A && ${GIT} commit -qm start && git update-ref ${"refs/thunderjar/start"} HEAD`);
      await sh(dir, `echo t > a.test.ts && git add -A && ${GIT} commit -qm '🔴 test' -m 'more'`);
      await sh(dir, `echo x >> keep.txt && git rm -q gone.txt && echo i > a.ts && git add -A && ${GIT} commit -qm '🟢 impl'`);
      await sh(dir, `echo uncommitted > u.txt`);
      const result = await commits.evaluate({}, ctxIn(dir));
      expect(result.outcome).toBe("measured");
      const data = (result as { data: Commit[] }).data;
      expect(data.map((c) => c.message)).toEqual(["🔴 test\n\nmore", "🟢 impl"]);
      expect(data[0]!.files).toEqual({ added: ["a.test.ts"], modified: [], deleted: [] });
      expect(data[1]!.files).toEqual({ added: ["a.ts"], modified: ["keep.txt"], deleted: ["gone.txt"] });
      expect(data[1]!.sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });

  test("is skipped without a start ref", async () => {
    const dir = `${TMP_DIR}/commits-${crypto.randomUUID()}`;
    await $`mkdir -p ${dir}`.quiet();
    try {
      expect((await commits.evaluate({}, ctxIn(dir))).outcome).toBe("skipped");
    } finally {
      await $`rm -rf ${dir}`.quiet();
    }
  });
});
