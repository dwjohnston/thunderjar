// The `commits` instrument, against a real container: a workspace with a start ref and two
// commits, measured through `docker exec` as the measurement container does. Skipped by `bun test`;
// run with `bun run test:docker`.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import type { Commit, MeasurementContext } from "../../api/declarations.ts";
import { commits } from "./commits.ts";

const NAME = `tj-test-${crypto.randomUUID().slice(0, 8)}-commits`;
const GIT = "git -c user.name=t -c user.email=t@t -c commit.gpgsign=false";

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("commits, against real Docker", () => {
  afterAll(async () => {
    await $`docker rm --force ${NAME}`.quiet().nothrow();
  });

  test("measures a workspace with two commits, oldest first", async () => {
    await $`docker run -d --name ${NAME} --entrypoint sleep alpine/git 600`.quiet();
    const exec = async (command: string) => {
      const r = await $`docker exec -w /workspace ${NAME} sh -c ${command}`.quiet().nothrow();
      return { stdout: r.stdout.toString(), stderr: r.stderr.toString(), exitCode: r.exitCode };
    };
    await $`docker exec ${NAME} mkdir -p /workspace`.quiet();
    await exec(`git init -q && echo a > keep.txt && git add -A && ${GIT} commit -qm start && git update-ref refs/thunderjar/start HEAD`);
    await exec(`echo t > a.test.ts && git add -A && ${GIT} commit -qm '🔴 test'`);
    await exec(`echo i > a.ts && echo x >> keep.txt && git add -A && ${GIT} commit -qm '🟢 impl'`);

    const result = await commits.evaluate({}, { exec } as unknown as MeasurementContext);
    expect(result.outcome).toBe("measured");
    const data = (result as { data: Commit[] }).data;
    expect(data.map(({ message, files }) => [message, files])).toEqual([
      ["🔴 test", { added: ["a.test.ts"], modified: [], deleted: [] }],
      ["🟢 impl", { added: ["a.ts"], modified: ["keep.txt"], deleted: [] }],
    ]);
  });
});
