import { afterEach, expect, test } from "bun:test";
import { makeTempDir, remove } from "../src/platform/fs.ts";
import { join, resolve } from "../src/platform/path.ts";
import type { Layout } from "./layout.ts";
import {
  BEGIN,
  END,
  applyRegion,
  basePatterns,
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

const nodeBan = { regex: "^node:", message: "Use Bun's APIs." };

const config = `{
  // hand-written
  "rules": { "eqeqeq": "error", "no-restricted-imports": ["error", { "patterns": [${JSON.stringify(nodeBan)}] }] },

  ${BEGIN}
  ${END}
}
`;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(remove));
});

/** A temporary project holding `files`, plus an .oxlintrc.json synced from `layout`. */
async function project(files: Record<string, string>, layout = fixtureLayout) {
  const dir = await makeTempDir("thunderjar-layout-");
  dirs.push(dir);
  await Bun.write(join(dir, ".oxlintrc.json"), config);
  for (const [path, content] of Object.entries(files)) {
    await Bun.write(join(dir, path), content);
  }
  await sync(dir, layout);
  return dir;
}

type Diagnostic = { code: string; help?: string; filename: string };

async function lint(dir: string) {
  // JSON, because oxlint otherwise picks a text format from the environment (github under GitHub
  // Actions, a compact one under coding agents), and they differ in whether they show help text.
  const proc = Bun.spawn([oxlint, "--format", "json"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const { diagnostics } = JSON.parse(stdout) as { diagnostics: Diagnostic[] };
  return { exitCode: await proc.exited, diagnostics };
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

test("every override repeats the top-level no-restricted-imports patterns", () => {
  expect(basePatterns(config)).toEqual([nodeBan]);
  expect(basePatterns(`{ "rules": {} }`)).toEqual([]);
  const overrides = generateOverrides({ ...fixtureLayout, "src/free": { allowedFiles: ["*.ts"], mayImport: Object.keys(fixtureLayout) } }, [nodeBan]);
  for (const { rules } of overrides) {
    expect((rules["no-restricted-imports"] as [string, { patterns: unknown[] }])[1].patterns[0]).toEqual(nodeBan);
  }
});

test("rewrites only the marked region, and is stable", () => {
  const once = applyRegion(config, generateOverrides(fixtureLayout));
  expect(once.startsWith(`${config.slice(0, config.indexOf(BEGIN))}${BEGIN}\n  "overrides": [`)).toBe(true);
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
  expect(await Bun.file(join(dir, ".oxlintrc.json")).text()).toContain("src/cli may not import from src/commands");
});

test("a project that follows the layout lints clean", async () => {
  // Also shows that "../commands/init.ts" from src/cli is judged by src/commands's entry, not src's.
  const dir = await project(wellPlaced);
  expect(await findMisplaced(dir, fixtureLayout)).toEqual([]);
  const { exitCode, diagnostics } = await lint(dir);
  expect(diagnostics).toEqual([]);
  expect(exitCode).toBe(0);
});

test("a forbidden import fails lint", async () => {
  const dir = await project({
    ...wellPlaced,
    "src/cli/index.ts": `import { config } from "../config.ts";\nconsole.log(config);\n`,
  });
  const { exitCode, diagnostics } = await lint(dir);
  expect(exitCode).not.toBe(0);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      code: "eslint(no-restricted-imports)",
      help: "src/cli may not import from src. See scripts/layout.ts.",
      filename: "src/cli/index.ts",
    }),
  );
});

test("a node: import fails lint, in a folder with an override too", async () => {
  // An override replaces the top-level rule's options, so this fails only if sync repeats them.
  const dir = await project({ ...wellPlaced, "src/cli/index.ts": `import { join } from "node:path";\nconsole.log(join);\n` });
  const { exitCode, diagnostics } = await lint(dir);
  expect(exitCode).not.toBe(0);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ code: "eslint(no-restricted-imports)", help: nodeBan.message, filename: "src/cli/index.ts" }),
  );
});

test("a misnamed file fails lint", async () => {
  const dir = await project({ ...wellPlaced, "src/commands/RunAll.ts": `export const x = 1;\n` });
  const { exitCode, diagnostics } = await lint(dir);
  expect(exitCode).not.toBe(0);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ code: "unicorn(filename-case)", filename: "src/commands/RunAll.ts" }),
  );
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
