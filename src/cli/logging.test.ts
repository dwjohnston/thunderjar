/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLhpmETxGQ7SW8synkm
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The diagnostic log: readable lines in a file, by default a new one in .thunderjar/logs/, at the
// level `-v`, `--log-level` or THUNDERJAR_LOG_LEVEL asks for, or info. Nothing of it reaches the
// terminal. The test harness points THUNDERJAR_LOG_FILE at a file under fixtures/.tmp/.
import { afterEach, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { copyScenarioProject, thunderjar } from "../testing/cli.ts";
import { fakeDocker } from "../testing/fakeDocker.ts";
import { scenario } from "../testing/scenario.ts";
import { dataDir, KEY, removeDataDirs } from "./commands/run/runTestSupport.ts";

afterEach(removeDataDirs);

/** Each line's level, module and message, e.g. `INFO: docker: building image`, without its time or details. */
const messages = (log: string) =>
  log
    .split("\n")
    .filter((line) => line.startsWith("["))
    .map((line) => line.replace(/^\[[\d:.]+\] /, ""));

async function run(args: string[], env: Record<string, string> = {}) {
  await using docker = await fakeDocker();
  // Awaited here, so the fake Docker outlives the run.
  return await thunderjar(scenario("0202"), [...args, "run", "example", "--data-dir", dataDir()], { env: { ...docker.env, ...KEY, ...env }, log: true });
}

describe("the diagnostic log", () => {
  test("by default: the execution, its builds and container runs, at info, and nothing on the terminal", async () => {
    const quiet = await run(["--log-level", "silent"]);
    const { stdout, stderr, exitCode, log } = await run([]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout.replace(/\(\d[^)]*\)/g, "")).toBe(quiet.stdout.replace(/\(\d[^)]*\)/g, ""));
    expect(messages(log as string)).toEqual([
      "INFO: execution: execution starting",
      "INFO: docker: building image",
      "INFO: docker: built image",
      "INFO: execution: container run starting",
      "INFO: docker: running container",
      "INFO: docker: container finished",
      "INFO: execution: container run finished",
      "INFO: execution: measured",
      "INFO: execution: execution finished",
    ]);
    expect(log).toContain('    status: "complete"');
    expect(log).not.toContain("\x1b[");
  });

  test("-v: each Docker command too, and the command that started", async () => {
    const { stderr, exitCode, log } = await run(["-v"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(messages(log as string)[0]).toBe("DEBUG: cli: command started");
    expect(messages(log as string)).toContain("DEBUG: docker: running docker");
  });

  test("THUNDERJAR_LOG_LEVEL=warn: nothing, as nothing went wrong", async () => {
    const { exitCode, log } = await run([], { THUNDERJAR_LOG_LEVEL: "warn" });

    expect(exitCode).toBe(0);
    expect(log).toBe("");
  });

  test("--log-level silent: no file", async () => {
    const { log } = await run(["--log-level", "silent"]);

    expect(log).toBe("");
  });

  test("without --log-file: a new file in .thunderjar/logs/, named for when and the command", async () => {
    await using copy = await copyScenarioProject("0202");

    const { exitCode } = await thunderjar(copy.dir, ["plan", "example"], { env: { ...KEY, THUNDERJAR_LOG_FILE: "" } });

    expect(exitCode).toBe(0);
    const files = [...new Glob("*").scanSync(`${copy.dir}/.thunderjar/logs`)];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z-plan\.log$/);
  });

  test("--log-level rejects a level pino doesn't have", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["--log-level", "loud", "plan", "example"]);

    expect(stderr).toContain("argument 'loud' is invalid");
    expect(exitCode).toBe(1);
  });
});
