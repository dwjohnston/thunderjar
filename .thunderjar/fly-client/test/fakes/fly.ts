// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// A stand-in for `fly`, for the client's tests. It keeps the app's machines and volumes in
// $FAKE_DIR, as JSON in the shape `fly … --json` prints, and logs every call.

import { logCall, readJson, writeJson } from "./state.ts";

const args = Bun.argv.slice(2);
await logCall("fly", args);

const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

type Machine = { id: string; name: string; state: string; region: string; config: Record<string, unknown> };
type Volume = { id: string; name: string; region: string; state: string; size_gb: number; attached_machine_id: string | null };

const machines = await readJson<Machine[]>("machines.json", []);
const volumes = await readJson<Volume[]>("volumes.json", []);
const machine = (id: string | undefined) => {
  const found = machines.find((m) => m.id === id);
  if (!found) {
    console.error(`Error: machine ${id} not found`);
    process.exit(1);
  }
  return found;
};

const [group, verb, target] = args;
switch (`${group} ${verb}`) {
  case "machine list":
    console.log(JSON.stringify(machines));
    break;
  case "machine start":
    machine(target).state = "started";
    break;
  case "machine stop":
    machine(target).state = "stopped";
    break;
  case "machine wait":
    break;
  case "machine update": {
    const found = machine(target);
    found.config = JSON.parse(option("--machine-config") ?? "{}");
    if (!args.includes("--skip-start")) found.state = "started";
    break;
  }
  case "machine run": {
    const config = { ...JSON.parse(option("--machine-config") ?? "{}"), image: target };
    machines.push({ id: "m-created", name: option("--name") ?? "", state: "started", region: option("--region") ?? "", config });
    for (const mount of (config.mounts ?? []) as { volume: string }[]) {
      const volume = volumes.find((v) => v.id === mount.volume);
      if (volume) volume.attached_machine_id = "m-created";
    }
    break;
  }
  case "machine destroy":
    machines.splice(machines.indexOf(machine(target)), 1);
    break;
  case "volumes list":
    console.log(JSON.stringify(volumes));
    break;
  case "volumes create": {
    const volume = {
      id: "vol_created",
      name: target ?? "",
      region: option("--region") ?? "",
      state: "created",
      size_gb: Number(option("--size")),
      attached_machine_id: null,
    };
    volumes.push(volume);
    console.log(JSON.stringify(volume));
    break;
  }
  case "volumes destroy":
    volumes.splice(volumes.findIndex((v) => v.id === target), 1);
    break;
  case "ssh issue": {
    const path = args[3] ?? "";
    await Bun.write(path, "fake key");
    await Bun.write(`${path}-cert.pub`, "fake certificate");
    break;
  }
  case "deploy --build-only":
    break;
  default:
    console.error(`fake fly: unexpected command: ${args.join(" ")}`);
    process.exit(1);
}

await writeJson("machines.json", machines);
await writeJson("volumes.json", volumes);
