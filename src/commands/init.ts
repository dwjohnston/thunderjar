import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const config = `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

const stub = (fn: string, body: string) => `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const baseImage = stub(
  "declareBaseImage",
  `{
  applyParameter: () => \`FROM node:20-bookworm\`,
}`,
);

const codeState = stub(
  "declareCodeState",
  `{
  commit: "a1b2c3",
  applyParameter: () => \`RUN npm ci\`,
}`,
);

const promptSet = stub(
  "declarePromptSet",
  `{
  commit: "e4f5a6",
  files: { "prompts/snerk.md": "CLAUDE.md" },
  applyParameter: () => \`\`,
}`,
);

const harnessIndex = stub(
  "declareHarness",
  `{
  applyParameter: (ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}\`,
  cli: (ctx) => \`claude -p "\${ctx.initialPrompt}" --model \${ctx.modelId} > \${ctx.resultPath}\`,
  requiredEnv: ["ANTHROPIC_API_KEY"],
}`,
);

const harnessModels = stub(
  "declareHarnessModels",
  `{
  "haiku-4-5": "claude-haiku-4-5-20251001",
}`,
);

const harnessVersions = stub(
  "declareHarnessVersions",
  `{
  "2.1.283": { version: "2.1.283" },
}`,
);

const collectTokenCosts = stub(
  "declareTokenCostCollector",
  `(_raw, _ctx) => {
  return { outcome: "unavailable", reason: "notReported" };
}`,
);

const initialPrompt = stub(
  "declareInitialPrompt",
  `{
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
  applyParameter: () => \`\`,
}`,
);

const measurement = stub(
  "declareMeasurement",
  `{
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
}`,
);

const testCase = stub(
  "declareTestCase",
  `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
}`,
);

// Brings _generated/parameter-names.d.ts into the editor's program alongside the files
// that use its names — without it they don't resolve, and nothing is checked
// (spec/055-declaring-test-cases.md#typed-names). `allowImportingTsExtensions` because
// thunderjar ships its TypeScript source.
const tsconfig =
  JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
      },
      include: ["**/*.ts"],
      // A templateTest template isn't TypeScript until it is rendered.
      exclude: ["node_modules", ".data", "**/*.template.ts"],
    },
    null,
    2,
  ) + "\n";

const P = "test-case-parameters";

/** Files `init` creates under `.thunderjar/`, keyed by relative path. */
function scaffold(): Record<string, string> {
  return {
    "thunderjar.config.ts": config,
    "tsconfig.json": tsconfig,
    "test-cases/example.ts": testCase,
    [`${P}/baseImages/node20/index.ts`]: baseImage,
    [`${P}/codeStates/baseline/index.ts`]: codeState,
    [`${P}/promptSets/snerk/index.ts`]: promptSet,
    [`${P}/harnessModels/claude-code/index.ts`]: harnessIndex,
    [`${P}/harnessModels/claude-code/models.ts`]: harnessModels,
    [`${P}/harnessModels/claude-code/versions.ts`]: harnessVersions,
    [`${P}/harnessModels/claude-code/collectTokenCosts.ts`]: collectTokenCosts,
    [`${P}/tasks/is-prime/initial-prompts/plain.ts`]: initialPrompt,
    [`${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`]: measurement,
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
