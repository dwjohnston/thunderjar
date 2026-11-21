// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// `up`: creates the machine if it's missing, starts it if it's stopped, and waits for its Docker
// daemon.

import { closeConnection, dockerOutput, ensureConnection } from "./connection.ts";
import { describeSize, findMachine, fly, type Guest, type Machine, type MachineConfig, type Volume } from "./fly.ts";
import { busy } from "./idle.ts";
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

const sameGuest = (a: Guest | undefined, b: Guest) =>
  a?.cpu_kind === b.cpu_kind && a.cpus === b.cpus && a.memory_mb === b.memory_mb;

/** What differs between the machine and what it should be: its size, its image, or the watchdog's
 * idle time. Empty when nothing does. */
function changes(settings: Settings, machine: Machine, image: string): Partial<MachineConfig> {
  const changed: Partial<MachineConfig> = {};
  const guest = desiredGuest(settings);
  // Unset, FLYIO_INSTANCE_SIZE leaves the size as it is.
  if (settings.cpus && !sameGuest(machine.config.guest, guest)) changed.guest = guest;
  if (machine.config.image !== image) changed.image = image;
  const sleep = String(settings.sleepMinutes);
  if (machine.config.env?.FLY_SLEEP_MINUTES !== sleep) changed.env = { ...machine.config.env, FLY_SLEEP_MINUTES: sleep };
  return changed;
}

/** Updates the machine if it differs from what it should be, and it's idle: updating restarts
 * it. Returns whether it did. */
async function updateIfChanged(settings: Settings, machine: Machine): Promise<boolean> {
  const image = await imageRef(settings.app);
  const changed = changes(settings, machine, image);
  // e.g. "resizing", for "not resizing m-1: 1 container is running"
  const what = [
    changed.guest && "resizing",
    changed.image && "updating the image of",
    changed.env && "updating the watchdog of",
  ].filter(Boolean);
  if (what.length === 0) return false;
  const reason = await busy(settings, machine);
  if (reason) {
    say(`not ${what.join(" or ")} ${machine.id}: ${reason}. Run up again once it's idle`);
    return false;
  }
  if (changed.guest) say(`resizing ${machine.id} from ${describeSize(machine.config.guest)} to ${describeSize(changed.guest)}`);
  if (changed.image) say(`moving ${machine.id} to ${image}`);
  if (changed.env) say(`setting the watchdog of ${machine.id} to ${settings.sleepMinutes} minutes`);
  if (changed.image) await buildImage(settings, image);
  await closeConnection(settings);
  const config: MachineConfig = { ...machine.config, ...changed };
  await fly(["machine", "update", machine.id, "-a", settings.app, "--machine-config", JSON.stringify(config), "--yes"]);
  return true;
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
    const began = Date.now();
    let machine = await findMachine(settings);
    const missing = !machine;
    if (!machine) {
      say(`no machine in ${settings.app}. Creating ${recipe.name}…`);
      await create(settings);
      machine = await findMachine(settings);
      if (!machine) throw new Error(`the machine in app ${settings.app} wasn't created`);
    } else if (machine.state === "stopping" || machine.state === "suspending") {
      await fly(["machine", "wait", machine.id, "-a", settings.app, "--state", "stopped", "-w", "90s"]).catch(() => "");
    }
    const updated = !missing && (await updateIfChanged(settings, machine));
    // A new machine starts by itself, as does an updated one.
    if (!missing && !updated && machine.state !== "started") {
      say(`machine ${machine.name} (${machine.id}) is ${machine.state}. Starting it…`);
      await fly(["machine", "start", machine.id, "-a", settings.app]);
    }
    await fly(["machine", "wait", machine.id, "-a", settings.app, "--state", "started", "-w", "120s"]);
    await waitForDaemon(settings, machine);
    const took = `${Math.round((Date.now() - began) / 1000)}s`;
    if (missing) say(`machine ${machine.name} (${machine.id}) created and started (${took})`);
    else if (machine.state !== "started") say(`machine ${machine.name} (${machine.id}) started (${took})`);
    return machine;
  });
}

export async function upCommand(_args: string[], settings: Settings): Promise<number> {
  const machine = await up(settings);
  const current = await findMachine(settings);
  console.log(`${machine.id} started, ${describeSize(current?.config.guest)}`);
  return 0;
}
