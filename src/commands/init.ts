import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const config = `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

const stub = (fn: string, body = "{}") =>
  `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const harnessIndex = `import { declareHarness } from "thunderjar";

export default declareHarness({
  applyParameter: (ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}\`,
  cli: (ctx) => \`claude -p "\${ctx.initialPrompt}" > \${ctx.resultPath}\`,
});
`;

const testCase = `import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`;

const P = "test-case-parameters";

/** Files `init` creates under `.thunderjar/`, keyed by relative path. */
function scaffold(): Record<string, string> {
  return {
    "thunderjar.config.ts": config,
    "test-cases/example.ts": testCase,
    [`${P}/baseImages/node20/index.ts`]: stub("declareBaseImage"),
    [`${P}/codeStates/baseline/index.ts`]: stub("declareCodeState"),
    [`${P}/promptSets/snerk/index.ts`]: stub("declarePromptSet"),
    [`${P}/harnessModels/claude-code/index.ts`]: harnessIndex,
    [`${P}/harnessModels/claude-code/models.ts`]: stub("declareHarnessModels"),
    [`${P}/harnessModels/claude-code/versions.ts`]: stub("declareHarnessVersions"),
    [`${P}/harnessModels/claude-code/collectTokenCosts.ts`]: stub("declareTokenCostCollector"),
    [`${P}/tasks/is-prime/initial-prompts/plain.ts`]: stub("declareInitialPrompt"),
    [`${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`]: stub("declareMeasurement"),
  };
}

export interface InitResult {
  created: string[];
  skipped: string[];
}

/**
 * Scaffolds `<projectRoot>/.thunderjar/`. Existing files are never overwritten.
 * A nested package.json is created only when the project has no root one.
 */
export async function init(projectRoot: string): Promise<InitResult> {
  const root = join(projectRoot, ".thunderjar");
  const nested = !existsSync(join(projectRoot, "package.json"));

  const files = scaffold();
  if (nested) {
    files["package.json"] =
      JSON.stringify(
        { name: "thunderjar-config", private: true, type: "module", dependencies: { thunderjar: "latest" } },
        null,
        2,
      ) + "\n";
  }
  files[".gitignore"] = ["_generated/", ".data/", ...(nested ? ["node_modules/"] : [])].join("\n") + "\n";

  const result: InitResult = { created: [], skipped: [] };
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    if (existsSync(path)) {
      result.skipped.push(rel);
      continue;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    result.created.push(rel);
  }
  return result;
}
