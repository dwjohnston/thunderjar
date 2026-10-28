// Builds the docs for every stable release tag into one GitHub Pages site.
//
// - Stable tags only: v1.2.3, not v1.2.3-next.0 or v1.2.3-rc.1.
// - Tags whose docs are identical share one build, at the oldest tag's URL.
//   Newer tags in the group get redirect pages to it.
// - Every version is built with the current theme, so all get the version switcher.
// - The site root serves the latest release.

import { $, CryptoHasher, Glob, write } from "bun";

const siteRoot = "/thunderjar/";
const docsDir = "docs";
const themeDir = `${docsDir}/.vitepress/theme`;

const repoRoot = (await $`git rev-parse --show-toplevel`.text()).trim();
const workDir = `${repoRoot}/.versioned-docs`;
const srcDir = `${workDir}/src`;
const buildDir = `${workDir}/build`;
const outDir = `${workDir}/dist`;

type Version = { tag: string; path: string; sameAs?: string };

const parseStable = (tag: string) => {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match ? match.slice(1).map(Number) : undefined;
};

const compareDesc = (a: string, b: string) => {
  const [x, y] = [parseStable(a)!, parseStable(b)!];
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return y[i]! - x[i]!;
  }
  return 0;
};

// Hash of the docs tree at a tag, ignoring the theme (replaced by the current one at build time).
const docsHash = async (tag: string) => {
  const entries = (await $`git ls-tree -r ${tag} -- ${docsDir}`.cwd(repoRoot).text())
    .split("\n")
    .filter((line) => line && !line.split("\t")[1]!.startsWith(`${themeDir}/`));
  if (entries.length === 0) return undefined;
  return new CryptoHasher("sha256").update(entries.join("\n")).digest("hex");
};

const prepareSource = async (tag: string) => {
  const dir = `${srcDir}/${tag}`;
  await $`mkdir -p ${dir}`;
  await $`git archive ${tag} ${docsDir} | tar -x -C ${dir}`.cwd(repoRoot);
  await $`rm -rf ${dir}/${themeDir}`;
  await $`cp -R ${repoRoot}/${themeDir} ${dir}/${themeDir}`;
  return `${dir}/${docsDir}`;
};

const build = async (source: string, base: string, name: string) => {
  const dest = `${buildDir}/${name}`;
  console.log(`Building ${name} with base ${base}`);
  await $`bunx vitepress build ${source} --base ${base} --outDir ${dest}`.cwd(repoRoot);
  return dest;
};

const writeRedirects = async (canonicalBuild: string, fromTag: string, toPath: string) => {
  for await (const file of new Glob("**/*.html").scan(canonicalBuild)) {
    const target = `${toPath}${file.replace(/(^|\/)index\.html$/, "$1")}`;
    await write(
      `${outDir}/${fromTag}/${file}`,
      `<!doctype html><meta charset="utf-8"><title>Redirecting</title>` +
        `<meta http-equiv="refresh" content="0; url=${target}">` +
        `<link rel="canonical" href="${target}">` +
        `<a href="${target}">${target}</a>\n`,
    );
  }
};

const tags = (await $`git tag --list ${"v*"}`.cwd(repoRoot).text())
  .split("\n")
  .filter((tag) => parseStable(tag))
  .sort(compareDesc);

// Newest first, so the last tag in each group is the oldest.
const groups = new Map<string, string[]>();
for (const tag of tags) {
  const hash = await docsHash(tag);
  if (!hash) {
    console.warn(`Skipping ${tag}: no ${docsDir}/ folder`);
    continue;
  }
  groups.set(hash, [...(groups.get(hash) ?? []), tag]);
}

const latest = [...groups.values()].flat().sort(compareDesc)[0];
if (!latest) {
  throw new Error("No stable release tags with docs found. Is the checkout missing tags?");
}

await $`rm -rf ${workDir}`;
await $`mkdir -p ${outDir}`;

const versions: Version[] = [];
for (const group of groups.values()) {
  const canonical = group.at(-1)!;
  const path = `${siteRoot}${canonical}/`;
  const source = await prepareSource(canonical);
  const built = await build(source, path, canonical);
  await $`cp -R ${built} ${outDir}/${canonical}`;

  if (group.includes(latest)) {
    const root = await build(source, siteRoot, "root");
    await $`cp -R ${root}/. ${outDir}`;
  }

  for (const tag of group) {
    if (tag === canonical) {
      versions.push({ tag, path });
    } else {
      await writeRedirects(built, tag, path);
      versions.push({ tag, path, sameAs: canonical });
    }
  }
}

versions.sort((a, b) => compareDesc(a.tag, b.tag));
await write(`${outDir}/versions.json`, `${JSON.stringify({ latest, root: siteRoot, versions }, null, 2)}\n`);

console.log(`Built ${groups.size} unique docs versions for ${versions.length} tags into ${outDir}`);
for (const { tag, sameAs } of versions) {
  console.log(`  ${tag}${tag === latest ? " (latest)" : ""}${sameAs ? ` -> ${sameAs}` : ""}`);
}
