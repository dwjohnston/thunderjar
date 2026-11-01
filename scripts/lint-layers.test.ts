import { describe, expect, test } from "bun:test";
import { applyLayers, generateOverrides, maxDepth, renderConfig, undeclaredFolders, type Override } from "./lint-layers";

const NODE_BAN = { regex: "^node:" };

/** The messages of the patterns that ban `specifier` when imported from `from`, as oxlint would apply them. */
function bans(overrides: Override[], from: string, specifier: string): string[] {
  const override = overrides.find((o) => o.files.some((glob) => new Bun.Glob(glob).match(from)));
  if (!override) return [];
  const [, options] = override.rules["no-restricted-imports"] as [string, { patterns: { regex: string; message?: string }[] }];
  return options.patterns.filter((p) => new RegExp(p.regex).test(specifier)).map((p) => p.message ?? p.regex);
}

describe("generateOverrides", () => {
  const overrides = generateOverrides(["project", "running", "cli"], 3, { patterns: [NODE_BAN] });

  test("bans importing a later layer", () => {
    expect(bans(overrides, "src/project/config.ts", "../running/run.ts")).toEqual([
      "src/project may not import from src/running: a layer may only import from the layers before it. See scripts/layers.ts.",
    ]);
    expect(bans(overrides, "src/project/config.ts", "../cli")).toHaveLength(1);
    expect(bans(overrides, "src/running/run.ts", "../cli/program.ts")).toHaveLength(1);
  });

  test("allows importing an earlier layer, or the same one", () => {
    expect(bans(overrides, "src/running/run.ts", "../project/config.ts")).toEqual([]);
    expect(bans(overrides, "src/project/a.ts", "./b.ts")).toEqual([]);
    expect(bans(overrides, "src/cli/commands/plan/plan.ts", "../../../running/run.ts")).toEqual([]);
  });

  test("bans a later layer from files in subfolders", () => {
    expect(bans(overrides, "src/project/a/b/c.ts", "../../../cli/program.ts")).toHaveLength(1);
  });

  test("tells a later layer apart from a subfolder of the same name", () => {
    expect(bans(overrides, "src/project/a/b/c.ts", "../cli/x.ts")).toEqual([]);
    expect(bans(overrides, "src/project/a/b/c.ts", "../../cli/x.ts")).toEqual([]);
  });

  test("allows imports from outside src", () => {
    expect(bans(overrides, "src/project/a.ts", "../../cli/x.ts")).toEqual([]);
    expect(bans(overrides, "src/project/a.ts", "commander")).toEqual([]);
  });

  test("keeps the top-level patterns", () => {
    expect(bans(overrides, "src/project/a/b.ts", "node:fs")).toEqual(["^node:"]);
  });

  test("covers each depth once", () => {
    expect(overrides.map((o) => o.files)).toEqual([
      ["src/project/*"],
      ["src/project/*/*"],
      ["src/project/*/*/*"],
      ["src/running/*"],
      ["src/running/*/*"],
      ["src/running/*/*/*"],
    ]);
  });

  test("escapes layer names", () => {
    const [override] = generateOverrides(["a", "b.c"], 1);
    expect(bans([override!], "src/a/x.ts", "../b.c/y.ts")).toHaveLength(1);
    expect(bans([override!], "src/a/x.ts", "../bxc/y.ts")).toEqual([]);
  });

  test("generates nothing for a single layer", () => {
    expect(generateOverrides(["cli"], 3, { patterns: [NODE_BAN] })).toEqual([]);
  });
});

describe("maxDepth", () => {
  test("counts the folders below src", () => {
    expect(maxDepth(["index.ts", "cli/program.ts", "cli/commands/init/init.ts"])).toBe(3);
  });

  test("is 0 with no files in folders", () => {
    expect(maxDepth([])).toBe(0);
    expect(maxDepth(["index.ts"])).toBe(0);
  });
});

describe("undeclaredFolders", () => {
  test("lists folders of src that are not layers", () => {
    expect(undeclaredFolders(["index.ts", "cli/program.ts", "store/a.ts", "store/b/c.ts", "api/x.ts"], ["cli"])).toEqual([
      "api",
      "store",
    ]);
  });
});

describe("applyLayers", () => {
  const config = {
    $schema: "./node_modules/oxlint/configuration_schema.json",
    rules: { eqeqeq: "error", "no-restricted-imports": ["error", { patterns: [NODE_BAN] }] },
    ignorePatterns: ["node_modules"],
  };

  test("adds the overrides, keeping the rest", () => {
    const applied = applyLayers(config, ["project", "cli"], ["project/a.ts"]);
    expect(applied).toEqual({ ...config, overrides: generateOverrides(["project", "cli"], 1, { patterns: [NODE_BAN] }) });
  });

  test("replaces existing overrides", () => {
    const stale = { ...config, overrides: [{ files: ["src/old/*"], rules: {} }] };
    expect(applyLayers(stale, ["cli"], ["cli/a.ts"]).overrides).toEqual([]);
  });

  test("renders the same config the same way", () => {
    const rendered = renderConfig(applyLayers(config, ["project", "cli"], ["project/a.ts"]));
    expect(renderConfig(applyLayers(JSON.parse(rendered), ["project", "cli"], ["project/a.ts"]))).toBe(rendered);
  });
});
