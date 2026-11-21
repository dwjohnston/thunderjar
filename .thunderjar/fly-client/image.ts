// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// The machine's image: built from machine/, and tagged with a hash of what it's built from, so
// `up` can tell when it's changed.

const MACHINE_DIR = `${import.meta.dir}/machine`;
const IMAGE_FILES = ["Dockerfile", "entrypoint.sh", "daemon.json"];

export const machineDir = MACHINE_DIR;

/** e.g. registry.fly.io/thunderjar-runtime-dwj:tj-3f9a1c0b2e4d */
export async function imageRef(app: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const name of IMAGE_FILES) {
    hasher.update(name);
    hasher.update(await Bun.file(`${MACHINE_DIR}/${name}`).text());
  }
  return `registry.fly.io/${app}:tj-${hasher.digest("hex").slice(0, 12)}`;
}
