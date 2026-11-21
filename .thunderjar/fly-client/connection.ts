// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// The SSH connection to the machine, which the local Docker CLI reaches its daemon through.
//
// Docker reaches it as an ssh:// host, so each command opens SSH sessions to it. They all share
// one connection, kept open in the background (OpenSSH's ControlMaster), so a command takes well
// under a second. Opening a new `fly ssh console` for each session instead took about 10 seconds.
//
// The connection is OpenSSH's, logged in with a certificate from `fly ssh issue`, and reaches the
// machine's SSH server through `fly ssh console` running `nc` there. If it drops mid-run, each
// command connects on its own, slowly, until the next one reopens it.

import { $ } from "bun";
import { fly } from "./fly.ts";
import { withLock } from "./lock.ts";
import type { Settings } from "./settings.ts";

export const HOST = "tjfly";
// Certificates last 24 hours: get a new one after 20.
const CERTIFICATE_MAX_AGE_MS = 20 * 60 * 60 * 1000;

const paths = (settings: Settings) => ({
  key: `${settings.runtimeDir}/key`,
  certificate: `${settings.runtimeDir}/key-cert.pub`,
  config: `${settings.runtimeDir}/ssh_config`,
  control: `${settings.runtimeDir}/ctl`,
  bin: `${settings.runtimeDir}/bin`,
});

const realSsh = (): string => {
  const ssh = Bun.which("ssh");
  if (!ssh) throw new Error("ssh is not installed");
  return ssh;
};

async function certificateFresh(settings: Settings): Promise<boolean> {
  const certificate = Bun.file(paths(settings).certificate);
  return (await certificate.exists()) && Date.now() - certificate.lastModified < CERTIFICATE_MAX_AGE_MS;
}

/** Whether the shared connection is open. */
export async function connected(settings: Settings): Promise<boolean> {
  const { config } = paths(settings);
  if (!(await Bun.file(config).exists())) return false;
  // Its input is closed, so it can never read the client's own, which is for the docker command.
  const proc = Bun.spawn([realSsh(), "-F", config, "-O", "check", HOST], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

/** The SSH config, and a stand-in `ssh` that uses it: Docker runs `ssh` from its PATH. */
async function writeConfig(settings: Settings, machineId: string): Promise<void> {
  const p = paths(settings);
  await Bun.write(
    p.config,
    [
      `Host ${HOST}`,
      "  User root",
      `  IdentityFile ${p.key}`,
      `  CertificateFile ${p.certificate}`,
      "  IdentitiesOnly yes",
      "  StrictHostKeyChecking no",
      "  UserKnownHostsFile /dev/null",
      "  LogLevel ERROR",
      `  ControlPath ${p.control}`,
      "  ControlMaster no",
      "  ServerAliveInterval 15",
      "  ServerAliveCountMax 3",
      `  ProxyCommand fly ssh console -a ${settings.app} --machine ${machineId} -q -C 'sh -c "exec nc $FLY_PRIVATE_IP 22"'`,
      "",
    ].join("\n"),
  );
  await Bun.write(`${p.bin}/ssh`, `#!/bin/sh\nexec '${realSsh()}' -F '${p.config}' "$@"\n`);
  await $`chmod +x ${p.bin}/ssh`.quiet();
}

/** Opens the shared connection in the background, detached from the client's output. */
async function open(settings: Settings): Promise<boolean> {
  const proc = Bun.spawn(
    [realSsh(), "-F", paths(settings).config, "-o", "ControlMaster=yes", "-o", "ConnectTimeout=20", "-fN", HOST],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore", timeout: 40_000 },
  );
  return (await proc.exited) === 0;
}

/** Gets a certificate if needed, and opens the shared connection if it isn't open. */
export async function ensureConnection(settings: Settings, machineId: string): Promise<void> {
  if ((await certificateFresh(settings)) && (await connected(settings))) return;
  // Several commands start at once at the beginning of a run: one sets up, the rest wait.
  await withLock(settings, "connection", async () => {
    const p = paths(settings);
    if (!(await certificateFresh(settings))) {
      await fly(["ssh", "issue", settings.org, p.key, "--hours", "24", "--overwrite"]);
    }
    await writeConfig(settings, machineId);
    if (await connected(settings)) return;
    // Its SSH server can take a few seconds to come up after the machine starts.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await open(settings)) return;
      await Bun.sleep(settings.pollMs);
    }
    throw new Error(`can't connect to the Fly machine ${machineId} in app ${settings.app}`);
  });
}

/** Closes the shared connection, before the machine stops, restarts or goes. */
export async function closeConnection(settings: Settings): Promise<void> {
  const { config } = paths(settings);
  if (!(await Bun.file(config).exists())) return;
  await Bun.spawn([realSsh(), "-F", config, "-O", "exit", HOST], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited;
}

/** The local Docker CLI, pointed at the machine's daemon. */
export function dockerCommand(args: string[]): string[] {
  return ["docker", "-H", `ssh://${HOST}`, ...args];
}

/** The environment the Docker CLI runs in: the stand-in `ssh` first on its PATH. */
export function dockerEnv(settings: Settings): Record<string, string | undefined> {
  return { ...Bun.env, PATH: `${paths(settings).bin}:${Bun.env.PATH}` };
}

/** Runs a docker command on the machine, with its output captured. */
export async function dockerOutput(settings: Settings, args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const proc = Bun.spawn(dockerCommand(args), { env: dockerEnv(settings), stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { exitCode, stdout };
}
