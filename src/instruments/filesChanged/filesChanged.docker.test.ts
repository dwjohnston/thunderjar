// The `filesChanged` instrument, against a real container: committed, uncommitted, untracked,
// ignored and renamed files, measured through `docker exec` as the measurement container does.
// Skipped by `bun test`; run with `bun run test:docker`.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import type { MeasurementContext } from "../../api/declarations.ts";
import { filesChanged } from "./filesChanged.ts";

const NAME = `tj-test-${crypto.randomUUID().slice(0, 8)}-files-changed`;
const GIT = "git -c user.name=t -c user.email=t@t -c commit.gpgsign=false";

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("filesChanged, against real Docker", () => {
  afterAll(async () => {
    await $`docker rm --force ${NAME}`.quiet().nothrow();
  });

  test("measures committed, uncommitted, untracked and renamed files, and leaves out ignored ones", async () => {
    await $`docker run -d --name ${NAME} --entrypoint sleep alpine/git 600`.quiet();
    const exec = async (command: string) => {
      const r = await $`docker exec -w /workspace ${NAME} sh -c ${command}`.quiet().nothrow();
      return { stdout: r.stdout.toString(), stderr: r.stderr.toString(), exitCode: r.exitCode };
    };
    const ctx = { exec } as unknown as MeasurementContext;
    await $`docker exec ${NAME} mkdir -p /workspace`.quiet();
    await exec(`git init -q && echo node_modules > .gitignore && echo a > keep.txt && echo b > edit.txt && echo c > gone.txt && echo d > old.txt && git add -A && ${GIT} commit -qm start && git update-ref refs/thunderjar/start HEAD`);
    await exec(`echo 1 > committed.txt && git add -A && ${GIT} commit -qm c`);
    await exec(`git mv old.txt new.txt && git rm -q gone.txt && echo x >> edit.txt && echo u > untracked.txt && mkdir node_modules && echo i > node_modules/ignored.js`);

    expect(await filesChanged.evaluate({}, ctx)).toEqual({
      outcome: "measured",
      data: { added: ["committed.txt", "new.txt", "untracked.txt"], modified: ["edit.txt"], deleted: ["gone.txt", "old.txt"] },
    });
    expect(await filesChanged.evaluate({ glob: "{edit,old}.txt" }, ctx)).toEqual({
      outcome: "measured",
      data: { added: [], modified: ["edit.txt"], deleted: ["old.txt"] },
    });
  });
});
