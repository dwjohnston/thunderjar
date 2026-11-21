// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Against real Fly: `up`, `docker ps` and `stop`, on a throwaway app that it creates and destroys.
// It costs a few cents. Run it with `bun run test:fly:real`, with FLYIO_TOKEN set, and `fly`,
// `ssh` and `docker` installed. Skipped otherwise.

import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { flyEnv } from "./settings.ts";

const enabled = Boolean(Bun.env.FLYIO_TOKEN) && Bun.env.THUNDERJAR_FLY_TESTS === "1";
const INDEX = `${import.meta.dir}/index.ts`;
const app = `tj-fly-client-test-${Math.random().toString(36).slice(2, 8)}`;
let dir = "";

const env = () => ({
  ...flyEnv(),
  FLY_APP: app,
  // The smallest performance machine: 1 CPU, 2 GB.
  FLYIO_INSTANCE_SIZE: "1",
  FLY_TIMER_FILE: `${dir}/.fly`,
  FLY_CLIENT_DIR: `${dir}/runtime`,
});

async function client(args: string[]) {
  const proc = Bun.spawn([process.execPath, INDEX, ...args], { env: env(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

const state = async () => {
  const machines = JSON.parse(await $`fly machine list -a ${app} --json`.env(env()).text()) as { state: string }[];
  return machines.map((machine) => machine.state);
};

describe.skipIf(!enabled)("against real Fly", () => {
  beforeAll(async () => {
    dir = (await $`mktemp -d /tmp/tjfr-XXXXXX`.text()).trim();
    await $`fly apps create ${app} --org ${Bun.env.FLY_ORG || "personal"}`.env(env()).quiet();
  });

  afterAll(async () => {
    const timer = Bun.file(`${dir}/.fly`);
    if (await timer.exists()) {
      const pid = ((await timer.json()) as { watcherPid?: number }).watcherPid;
      if (pid) process.kill(pid);
    }
    await client(["destroy", "--force"]);
    await $`fly apps destroy ${app} --yes`.env(env()).nothrow().quiet();
    await $`rm -rf ${dir}`;
  });

  test(
    "up creates and starts the machine, docker ps runs on it, and stop stops it",
    async () => {
      const up = await client(["up"]);
      expect(up.exitCode, up.stderr).toBe(0);
      expect(await state()).toEqual(["started"]);

      const ps = await client(["docker", "ps"]);
      expect(ps.exitCode, ps.stderr).toBe(0);
      expect(ps.stdout).toContain("CONTAINER ID");

      const stop = await client(["stop"]);
      expect(stop.exitCode, stop.stderr).toBe(0);
      expect(await state()).toEqual(["stopped"]);
    },
    20 * 60 * 1000,
  );
});
