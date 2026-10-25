import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { compareVersions, stableVersionFromTag } from "./release-policy.ts";

const root = join(import.meta.dir, "../..");
const output = join(root, "docs/.vitepress/dist");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

export function stableTags(tags: string[]): { tag: string; version: string }[] {
  return tags.flatMap((tag) => {
    const version = stableVersionFromTag(tag);
    return version ? [{ tag, version }] : [];
  }).sort((a, b) => compareVersions(b.version, a.version));
}

async function stage(tag: string, directory: string) {
  await mkdir(join(directory, ".vitepress"), { recursive: true });
  await cp(join(root, "docs/.vitepress/config.ts"), join(directory, ".vitepress/config.ts"));
  await cp(join(root, "docs/.vitepress/theme"), join(directory, ".vitepress/theme"), { recursive: true });
  const paths = git("ls-tree", "-r", "--name-only", tag, "--", "docs")
    .split("\n")
    .filter((path) => path.startsWith("docs/") &&
      (!path.startsWith("docs/.vitepress/") || path.startsWith("docs/.vitepress/public/")));
  if (!paths.includes("docs/index.md")) throw new Error(`${tag} has no docs/index.md`);
  for (const path of paths) {
    const target = join(directory, path.slice("docs/".length));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, execFileSync("git", ["show", `${tag}:${path}`], { cwd: root }));
  }
}

function build(source: string, destination: string, base: string, current: string, versions: string[]) {
  const result = spawnSync(join(root, "node_modules/.bin/vitepress"), ["build", source], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      THUNDERJAR_DOCS_BASE: base,
      THUNDERJAR_DOCS_OUT_DIR: destination,
      THUNDERJAR_DOCS_CURRENT: current,
      THUNDERJAR_DOCS_VERSIONS: JSON.stringify(versions),
    },
  });
  if (result.status !== 0) throw new Error(`VitePress build failed for ${current}`);
}

async function main() {
  const tags = stableTags(git("tag", "--list").split("\n"));
  if (tags.length === 0) throw new Error("No stable release tags found");
  for (const { tag, version } of tags) {
    const packageJson = JSON.parse(git("show", `${tag}:package.json`)) as { version: string };
    if (packageJson.version !== version) throw new Error(`${tag} does not match its package.json version`);
  }
  const versions = tags.map(({ version }) => version);
  const temp = await mkdtemp(join(root, "docs/.vitepress/stage-"));
  try {
    await rm(output, { recursive: true, force: true });
    for (const [index, { tag, version }] of tags.entries()) {
      const source = join(temp, version);
      await stage(tag, source);
      if (index === 0) build(source, output, "/thunderjar/", "latest", versions);
      build(source, join(output, "v", version), `/thunderjar/v/${version}/`, version, versions);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  const latestPage = await readFile(join(output, "index.html"), "utf8");
  if (!latestPage.includes("Thunderjar")) throw new Error("Latest stable docs build is empty");
}

if (import.meta.main) await main();
