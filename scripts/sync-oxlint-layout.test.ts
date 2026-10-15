import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Layout } from "./layout.ts";
import {
  BEGIN,
  END,
  applyRegion,
  findMisplaced,
  formatMisplaced,
  generateOverrides,
  sync,
} from "./sync-oxlint-layout.ts";

const oxlint = resolve(import.meta.dir, "..", "node_modules", ".bin", "oxlint");

const fixtureLayout: Layout = {
  src: { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
  "src/cli": { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
  "src/commands": { allowedFiles: ["*.ts"], mayImport: ["src"] },
};

const config = `{
  // hand-written
  "rules": { "eqeqeq": "error" },

  ${BEGIN}
  ${END}
}
`;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A temporary project holding `files`, plus an .oxlintrc.json synced from `layout`. */
async function project(files: Record<string, string>, layout = fixtureLayout) {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-layout-"));
  dirs.push(dir);
  await writeFile(join(dir, ".oxlintrc.json"), config);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  await sync(dir, layout);
  return dir;
}

async function lint(dir: string) {
  const proc = Bun.spawn([oxlint], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const output = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
  return { exitCode: await proc.exited, output };
}

const wellPlaced = {
  "src/config.ts": `export const config = 1;\n`,
  "src/commands/init.ts": `import { config } from "../config.ts";\nexport const init = config;\n`,
  "src/cli/index.ts": `import { init } from "../commands/init.ts";\nconsole.log(init);\n`,
};

test("generates one override per folder, restricting every folder not in mayImport", () => {
  expect(generateOverrides(fixtureLayout)).toEqual([
    {
      files: ["src/*"],
      rules: {
        "unicorn/filename-case": ["error", { case: "kebabCase" }],
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^\\./cli(/[^/]+)?$",
                message: "src may not import from src/cli. See scripts/layout.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/cli/*"],
      rules: {
        "unicorn/filename-case": ["error", { case: "kebabCase" }],
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^\\.\\.(/[^/]+)?$",
                message: "src/cli may not import from src. See scripts/layout.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/commands/*"],
      rules: {
        "unicorn/filename-case": ["error", { case: "kebabCase" }],
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^\\.\\./cli(/[^/]+)?$",
                message: "src/commands may not import from src/cli. See scripts/layout.ts.",
              },
            ],
          },
        ],
      },
    },
  ]);
});

test("rewrites only the marked region, and is stable", () => {
  const once = applyRegion(config, generateOverrides(fixtureLayout));
  expect(once.startsWith(`{\n  // hand-written\n  "rules": { "eqeqeq": "error" },\n\n  ${BEGIN}\n  "overrides": [`)).toBe(true);
  expect(once.endsWith(`],\n  ${END}\n}\n`)).toBe(true);
  expect(applyRegion(once, generateOverrides(fixtureLayout))).toBe(once);
});

test("fails when the markers are missing", () => {
  expect(() => applyRegion(`{ "rules": {} }`, [])).toThrow("must contain the markers");
});

test("sync reports whether the config changed", async () => {
  const dir = await project(wellPlaced);
  expect(await sync(dir, fixtureLayout)).toBe(false);
  expect(await sync(dir, { ...fixtureLayout, "src/cli": { allowedFiles: ["*.ts"] } })).toBe(true);
  expect(await readFile(join(dir, ".oxlintrc.json"), "utf8")).toContain("src/cli may not import from src/commands");
});

test("a project that follows the layout lints clean", async () => {
  // Also shows that "../commands/init.ts" from src/cli is judged by src/commands's entry, not src's.
  const dir = await project(wellPlaced);
  expect(await findMisplaced(dir, fixtureLayout)).toEqual([]);
  const { exitCode, output } = await lint(dir);
  expect(output).not.toContain("error");
  expect(exitCode).toBe(0);
});

test("a forbidden import fails lint", async () => {
  const dir = await project({
    ...wellPlaced,
    "src/cli/index.ts": `import { config } from "../config.ts";\nconsole.log(config);\n`,
  });
  const { exitCode, output } = await lint(dir);
  expect(exitCode).not.toBe(0);
  expect(output).toContain("no-restricted-imports");
  expect(output).toContain("src/cli may not import from src. See scripts/layout.ts.");
});

test("a misnamed file fails lint", async () => {
  const dir = await project({ ...wellPlaced, "src/commands/RunAll.ts": `export const x = 1;\n` });
  const { exitCode, output } = await lint(dir);
  expect(exitCode).not.toBe(0);
  expect(output).toContain("filename-case");
  expect(output).toContain("RunAll.ts");
});

test("a file in an uncovered folder fails the check", async () => {
  const dir = await project({
    ...wellPlaced,
    "src/adapters/docker.ts": `export const docker = 1;\n`,
    "test/fixtures/thing.ts": `export const thing = 1;\n`,
    "src/commands/notes.md": `not allowed by *.ts\n`,
  });
  const misplaced = await findMisplaced(dir, fixtureLayout);
  expect(misplaced).toEqual(["src/adapters/docker.ts", "src/commands/notes.md", "test/fixtures/thing.ts"]);
  expect(formatMisplaced(misplaced)).toContain(
    "src/adapters/docker.ts: not allowed here by scripts/layout.ts. See 150-repository-layout.md in the spec.",
  );
});

test("this repository passes --check", async () => {
  const script = resolve(import.meta.dir, "sync-oxlint-layout.ts");
  const proc = Bun.spawn(["bun", script, "--check"], { stdout: "pipe", stderr: "pipe" });
  expect(await new Response(proc.stderr).text()).toBe("");
  expect(await proc.exited).toBe(0);
});
