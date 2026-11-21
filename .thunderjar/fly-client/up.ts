// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `up`: creates the machine if it's missing, starts it if it's stopped, and waits for its Docker
// daemon.

import { dockerOutput, ensureConnection } from "./connection.ts";
import { describeSize, findMachine, fly, type Guest, type Machine, type MachineConfig, type Volume } from "./fly.ts";
import { imageRef, machineDir } from "./image.ts";
import { withLock } from "./lock.ts";
import recipe from "./machine/recipe.json";
import type { Settings } from "./settings.ts";

const say = (message: string) => console.error(`fly-client: ${message}`);

/** performance-<cpus>x, with 2 GB a CPU, or the recipe's size. */
export function desiredGuest(settings: Settings): Guest {
  return settings.cpus
    ? { cpu_kind: "performance", cpus: settings.cpus, memory_mb: settings.cpus * 2048 }
    : recipe.config.guest;
}

async function buildImage(settings: Settings, image: string): Promise<void> {
  say(`building the machine's image, ${image}`);
  const label = image.split(":").at(-1) ?? "";
  await fly(
    ["deploy", "--build-only", "--push", "--image-label", label, "-a", settings.app, "--config", "fly.toml", "--dockerfile", "Dockerfile"],
    { cwd: machineDir },
  );
}

/** An unattached volume from the recipe, in the region, or a new one. */
async function volumeFor(settings: Settings): Promise<string> {
  const volumes = JSON.parse(await fly(["volumes", "list", "-a", settings.app, "--json"])) as Volume[];
  const free = volumes.find(
    (v) => v.name === recipe.volume.name && v.region === settings.region && !v.attached_machine_id && v.state === "created",
  );
  if (free) return free.id;
  const created = JSON.parse(
    await fly([
      "volumes", "create", recipe.volume.name,
      "-a", settings.app,
      "--region", settings.region,
      "--size", String(recipe.volume.sizeGb),
      "--yes", "--json",
    ]),
  ) as Volume;
  return created.id;
}

async function create(settings: Settings): Promise<void> {
  const image = await imageRef(settings.app);
  await buildImage(settings, image);
  const volume = await volumeFor(settings);
  const config: MachineConfig = {
    ...recipe.config,
    guest: desiredGuest(settings),
    env: { ...recipe.config.env, FLY_SLEEP_MINUTES: String(settings.sleepMinutes) },
    mounts: [{ volume, path: recipe.volume.path }],
  };
  say(`creating the machine, ${describeSize(config.guest)}, in ${settings.region}`);
  await fly([
    "machine", "run", image,
    "-a", settings.app,
    "--name", recipe.name,
    "--region", settings.region,
    "--machine-config", JSON.stringify(config),
    "--detach",
  ]);
}

/** Waits until the machine's Docker daemon answers, twice in a row: after a start it can answer
 * once and then go away as the machine restarts. */
async function waitForDaemon(settings: Settings, machine: Machine): Promise<void> {
  let answered = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    await ensureConnection(settings, machine.id).catch(() => {});
    answered = (await dockerOutput(settings, ["version", "--format", "{{.Server.Version}}"])).exitCode === 0 ? answered + 1 : 0;
    if (answered >= 2) return;
    await Bun.sleep(settings.pollMs);
  }
  throw new Error(`the Docker daemon on ${machine.id} didn't answer after it started`);
}

/** Brings the machine up. Returns it, started, with its daemon answering. */
export async function up(settings: Settings): Promise<Machine> {
  // Several commands can find it stopped at once: one brings it up, the rest wait.
  return await withLock(settings, "up", async () => {
    let machine = await findMachine(settings);
    const missing = !machine;
    if (!machine) {
      await create(settings);
      machine = await findMachine(settings);
      if (!machine) throw new Error(`the machine in app ${settings.app} wasn't created`);
    } else if (machine.state === "stopping" || machine.state === "suspending") {
      await fly(["machine", "wait", machine.id, "-a", settings.app, "--state", "stopped", "-w", "90s"]).catch(() => "");
    }
    // A new machine starts by itself.
    if (!missing && machine.state !== "started") {
      say(`starting ${machine.id}`);
      await fly(["machine", "start", machine.id, "-a", settings.app]);
    }
    await fly(["machine", "wait", machine.id, "-a", settings.app, "--state", "started", "-w", "120s"]);
    await waitForDaemon(settings, machine);
    return machine;
  });
}

export async function upCommand(_args: string[], settings: Settings): Promise<number> {
  const machine = await up(settings);
  const current = await findMachine(settings);
  console.log(`${machine.id} started, ${describeSize(current?.config.guest)}`);
  return 0;
}
