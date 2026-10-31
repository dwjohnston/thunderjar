// Builds the CLI and resets the two manual-testing directories named in .env.
// Bun loads .env automatically.
import { $ } from "bun";
import { homedir, listDir, makeDir, remove } from "../src/platform/fs.ts";
import { resolve, sep } from "../src/platform/path.ts";

const repo = resolve(import.meta.dir, "..");

function dirFromEnv(name: string): string {
  const value = Bun.env[name];
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  const dir = resolve(value);
  const home = homedir();
  const unsafe =
    dir === sep ||
    dir === home ||
    home.startsWith(dir + sep) ||
    dir === repo ||
    repo.startsWith(dir + sep);
  if (unsafe) {
    console.error(`${name}=${dir} contains or is the repo, your home, or root. Refusing to clear it.`);
    process.exit(1);
  }
  return dir;
}

const jsDir = dirFromEnv("THUNDERJAR_TRY_JS_DIR");
const nonJsDir = dirFromEnv("THUNDERJAR_TRY_NON_JS_DIR");
if (jsDir === nonJsDir) {
  console.error("THUNDERJAR_TRY_JS_DIR and THUNDERJAR_TRY_NON_JS_DIR must differ.");
  process.exit(1);
}

async function reset(dir: string) {
  await makeDir(dir);
  for (const entry of listDir(dir)) {
    await remove(resolve(dir, entry));
  }
}

await $`bun run build`.cwd(repo);
await $`bun link`.cwd(repo).quiet();

await reset(jsDir);
await Bun.write(resolve(jsDir, "package.json"), JSON.stringify({ name: "try-js", private: true }, null, 2) + "\n");
await $`bun link thunderjar`.cwd(jsDir).quiet();

await reset(nonJsDir);

console.log(`
JS project (has package.json):
  cd ${jsDir} && bunx thunderjar init

Non-JS project (no package.json):
  cd ${nonJsDir} && bun ${repo}/dist/cli.js init
`);
