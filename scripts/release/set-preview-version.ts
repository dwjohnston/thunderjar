import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const version = process.argv[2];
if (!version || !/^0\.0\.0-pr\.[1-9]\d*\.g[0-9a-f]{40}$/.test(version)) {
  throw new Error("Invalid preview version");
}
const path = join(import.meta.dir, "../..", "package.json");
const packageJson = JSON.parse(await readFile(path, "utf8")) as { version: string };
packageJson.version = version;
await writeFile(path, JSON.stringify(packageJson, null, 2) + "\n");
