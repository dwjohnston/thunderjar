#!/usr/bin/env bun
// AI-generated script. Review before relying on it.
import { $, CryptoHasher, Glob, write } from "bun";

const SITE_ROOT = "/thunderjar/";
const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const DOCS_DIR = "docs";
const THEME_DIR = `${DOCS_DIR}/.vitepress/theme`;
// The docs import the CLI from src/ (which reads package.json) to generate the CLI reference pages.
const SOURCE_DIRS = [DOCS_DIR, "src"];
// Left out of the docs hash, because its version changes with every release.
const SOURCE_FILES = ["package.json"];
const TEST_FILE = /\.test\.ts$/;
const WORK_DIR = ".versioned-docs";
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function help() {
  console.log(`
Build the docs for every stable release tag into one GitHub Pages site.

- Stable tags only: v1.2.3, not v1.2.3-next.0 or v1.2.3-rc.1.
- Tags whose docs are identical share one build, at the oldest tag's URL.
  Newer tags in the group get redirect pages to it.
- Docs are identical when the hash of the ${SOURCE_DIRS.join("/ and ")}/ trees matches,
  ignoring ${THEME_DIR}/ and test files. src/ is included because the CLI
  reference pages are generated from it. ${SOURCE_FILES.join(", ")} is extracted
  but not hashed, since its version changes with every release.
- Every version is built with the current theme, so all get the version switcher.
- The site root (${SITE_ROOT}) serves the latest release.

Output goes to ${WORK_DIR}/dist, along with versions.json for the switcher.

Usage:
  bun scripts/build-versioned-docs.ts

Options:
  -h, --help     Show this message
`);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    help();
    process.exit(0);
  }

  if (args.length > 0) {
    console.error(`Unexpected arguments: ${args.join(" ")}`);
    help();
    process.exit(1);
  }

  await main(REPO_ROOT);
}

type Version = { tag: string; path: string; sameAs?: string };

// 👇
export async function main(repoRoot: string) {
  const workDir = `${repoRoot}/${WORK_DIR}`;
  const outDir = `${workDir}/dist`;

  const tags = (await $`git tag --list ${"v*"}`.cwd(repoRoot).text())
    .split("\n")
    .filter((tag) => STABLE_TAG.test(tag))
    .sort(compareDesc);

  if (tags.length === 0) {
    throw new Error("No stable release tags found. Is the checkout missing tags?");
  }

  // Tags are newest first, so the last tag in each group is the oldest.
  const groups = new Map<string, string[]>();
  for (const tag of tags) {
    const hash = await docsHash(repoRoot, tag);
    groups.set(hash, [...(groups.get(hash) ?? []), tag]);
  }
  const latest = tags[0]!;

  await $`rm -rf ${workDir}`;
  await $`mkdir -p ${outDir}`;

  const versions: Version[] = [];
  for (const group of groups.values()) {
    const canonical = group.at(-1)!;
    const path = `${SITE_ROOT}${canonical}/`;
    const source = await prepareSource(repoRoot, workDir, canonical);
    const built = await build(repoRoot, source, path, `${workDir}/build/${canonical}`);
    await $`cp -R ${built} ${outDir}/${canonical}`;

    if (group.includes(latest)) {
      const root = await build(repoRoot, source, SITE_ROOT, `${workDir}/build/root`);
      await $`cp -R ${root}/. ${outDir}`;
    }

    for (const tag of group) {
      if (tag === canonical) {
        versions.push({ tag, path });
      } else {
        await writeRedirects(built, `${outDir}/${tag}`, path);
        versions.push({ tag, path, sameAs: canonical });
      }
    }
  }

  versions.sort((a, b) => compareDesc(a.tag, b.tag));
  await write(
    `${outDir}/versions.json`,
    `${JSON.stringify({ latest, root: SITE_ROOT, versions }, null, 2)}\n`,
  );

  console.log(`Built ${groups.size} unique docs versions for ${versions.length} tags into ${outDir}`);
  for (const { tag, sameAs } of versions) {
    console.log(`  ${tag}${tag === latest ? " (latest)" : ""}${sameAs ? ` -> ${sameAs}` : ""}`);
  }
}

function compareDesc(a: string, b: string) {
  const [x, y] = [STABLE_TAG.exec(a)!.slice(1).map(Number), STABLE_TAG.exec(b)!.slice(1).map(Number)];
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return y[i]! - x[i]!;
  }
  return 0;
}

// The theme is left out because every version is built with the current one.
async function docsHash(repoRoot: string, tag: string) {
  const entries = (await $`git ls-tree -r ${tag} -- ${SOURCE_DIRS}`.cwd(repoRoot).text())
    .split("\n")
    .filter((line) => {
      const path = line.split("\t")[1];
      return path && !path.startsWith(`${THEME_DIR}/`) && !TEST_FILE.test(path);
    });
  if (!entries.some((line) => line.split("\t")[1]!.startsWith(`${DOCS_DIR}/`))) {
    throw new Error(`Tag ${tag} has no ${DOCS_DIR}/ folder.`);
  }
  return new CryptoHasher("sha256").update(entries.join("\n")).digest("hex");
}

async function prepareSource(repoRoot: string, workDir: string, tag: string) {
  const dir = `${workDir}/src/${tag}`;
  await $`mkdir -p ${dir}`;
  const sources = [...SOURCE_DIRS, ...SOURCE_FILES];
  const present = (await $`git ls-tree --name-only ${tag} -- ${sources}`.cwd(repoRoot).text())
    .split("\n")
    .filter(Boolean);
  await $`git archive ${tag} ${present} | tar -x -C ${dir}`.cwd(repoRoot);
  await $`rm -rf ${dir}/${THEME_DIR}`;
  await $`cp -R ${repoRoot}/${THEME_DIR} ${dir}/${THEME_DIR}`;
  return `${dir}/${DOCS_DIR}`;
}

async function build(repoRoot: string, source: string, base: string, dest: string) {
  console.log(`Building ${source} with base ${base}`);
  await $`bunx vitepress build ${source} --base ${base} --outDir ${dest}`.cwd(repoRoot);
  return dest;
}

// One redirect page per page of the canonical build, so deep links keep working.
async function writeRedirects(canonicalBuild: string, dest: string, toPath: string) {
  for await (const file of new Glob("**/*.html").scan(canonicalBuild)) {
    const target = `${toPath}${file.replace(/(^|\/)index\.html$/, "$1")}`;
    await write(
      `${dest}/${file}`,
      `<!doctype html><meta charset="utf-8"><title>Redirecting</title>` +
        `<meta http-equiv="refresh" content="0; url=${target}">` +
        `<link rel="canonical" href="${target}">` +
        `<a href="${target}">${target}</a>\n`,
    );
  }
}
