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

// The diagnostic log: JSON lines on stderr, at the level `--log-level` or THUNDERJAR_LOG_LEVEL asks
// for, and none by default. A command's output on stdout is the same either way.
import { afterEach, describe, expect, test } from "bun:test";
import { thunderjar } from "../testing/cli.ts";
import { fakeDocker } from "../testing/fakeDocker.ts";
import { scenario } from "../testing/scenario.ts";
import { dataDir, removeDataDirs } from "./commands/run/runTestSupport.ts";

afterEach(removeDataDirs);

type Line = { level: number; module?: string; msg: string; [key: string]: unknown };
const linesOf = (stderr: string): Line[] => stderr.split("\n").filter(Boolean).map((line) => JSON.parse(line));

async function run(args: string[], env: Record<string, string> = {}) {
  await using docker = await fakeDocker();
  const data = dataDir();
  return thunderjar(scenario("0205"), ["run", "remember", "--data-dir", data, ...args], { env: { ...docker.env, ...env } });
}

describe("the diagnostic log", () => {
  test("is silent by default", async () => {
    const { stderr, exitCode } = await run([]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("--log-level info: the execution and its container runs, by module, and stdout unchanged", async () => {
    const silent = await run([]);
    const { stdout, stderr, exitCode } = await run(["--log-level", "info"]);

    expect(exitCode).toBe(0);
    expect(stdout.replace(/\(\d[^)]*\)/g, "")).toBe(silent.stdout.replace(/\(\d[^)]*\)/g, ""));
    const lines = linesOf(stderr);
    expect(lines.every((line) => line.level >= 30)).toBe(true);
    expect(lines.map(({ module, msg }) => `${module}: ${msg}`)).toEqual([
      "execution: execution starting",
      "docker: building image",
      "docker: built image",
      "execution: container run starting",
      "docker: running container",
      "docker: container finished",
      "execution: container run finished",
      "execution: measured",
      "execution: execution finished",
    ]);
    expect(lines.at(-1)).toMatchObject({ status: "complete" });
  });

  test("THUNDERJAR_LOG_LEVEL=debug: each Docker command too, and the command that started", async () => {
    const { stderr, exitCode } = await run([], { THUNDERJAR_LOG_LEVEL: "debug" });

    expect(exitCode).toBe(0);
    const lines = linesOf(stderr);
    expect(lines.some((line) => line.level === 20 && line.module === "docker")).toBe(true);
    expect(lines.find((line) => line.module === "cli")).toMatchObject({ msg: "command started", command: "run", args: ["remember"] });
  });

  test("--log-level rejects a level pino doesn't have", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0205"), ["--log-level", "loud", "plan", "remember"]);

    expect(stderr).toContain("argument 'loud' is invalid");
    expect(exitCode).toBe(1);
  });
});
