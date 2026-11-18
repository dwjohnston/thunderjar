/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { afterAll, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { TMP_DIR } from "../testing/cli.ts";
import { openShellSession } from "./shellSession.ts";

// A stand-in for `docker run`: runs its last argument, the session script, with this machine's
// `sh`, in a folder of its own. So these test the script the container runs, not a fake of it.
const dir = `${TMP_DIR}/shell-session-${crypto.randomUUID()}`;
await $`mkdir -p ${dir}/work`.quiet();
const runner = `${dir}/docker`;
await Bun.write(runner, `#!/bin/sh\nfor last; do :; done\ncd ${dir}/work && exec sh -c "$last"\n`);
await $`chmod +x ${runner}`.quiet();
const runtime = { command: [runner], pull: "missing" as const };
afterAll(async () => void (await $`rm -rf ${dir}`.quiet()));

describe("openShellSession", () => {
  test("starts in the image's working directory, and runs each command there with sh", async () => {
    const session = await openShellSession("image", "c1", runtime);
    expect(session.workdir).toBe((await $`sh -c ${"pwd -P"}`.cwd(`${dir}/work`).text()).trim());
    expect(await session.run("pwd -P; echo out; echo err >&2; exit 3")).toEqual({ exitCode: 3, stdout: `${session.workdir}\nout\n`, stderr: "err\n" });
    await session.close();
  });

  test("gives a command its stdin, byte for byte, and returns its output whole, however big", async () => {
    const session = await openShellSession("image", "c2", runtime);
    const input = "line 1\nno newline at the end, 'quotes' and \"more\", ünïcode";
    expect(await session.run("cat", input)).toEqual({ exitCode: 0, stdout: input, stderr: "" });
    const big = await session.run("i=0; while [ $i -lt 20000 ]; do echo 0123456789; i=$((i + 1)); done");
    expect(big.stdout.length).toBe(220_000);
    // The next command's line isn't taken as part of the last one's stdin or output.
    expect((await session.run("echo next")).stdout).toBe("next\n");
    await session.close();
  });

  test("runs commands sent at once one after another, each with its own result", async () => {
    const session = await openShellSession("image", "c3", runtime);
    const results = await Promise.all([1, 2, 3, 4].map((n) => session.run(`echo ${n} > n.txt; sleep 0.0${n}; cat n.txt`)));
    expect(results.map(({ stdout }) => stdout)).toEqual(["1\n", "2\n", "3\n", "4\n"]);
    await session.close();
  });

  test("a container that doesn't start is an error, with Docker's reason", async () => {
    const failing = `${dir}/failing`;
    await Bun.write(failing, "#!/bin/sh\necho 'docker: Error response from daemon: No such image: nope' >&2\nexit 125\n");
    await $`chmod +x ${failing}`.quiet();
    expect(openShellSession("nope", "c4", { command: [failing], pull: "missing" })).rejects.toThrow(
      "docker: Error response from daemon: No such image: nope",
    );
  });

  test("a session whose shell has ended says so for each later command", async () => {
    const session = await openShellSession("image", "c5", runtime);
    await session.run("kill $PPID").catch(() => {});
    expect(session.run("echo hello")).rejects.toThrow("the shell session in c5 has ended");
    await session.close();
  });
});
