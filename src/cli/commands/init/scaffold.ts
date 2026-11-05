// What `thunderjar init` writes into `.thunderjar/`: a runnable example test case, and the
// parameters it uses.

const declaration = (fn: string, body: string) =>
  `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const config = `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

// `allowImportingTsExtensions` because thunderjar ships its TypeScript source.
const tsconfig = json({
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
  exclude: ["node_modules", ".data"],
});

const testCase = declaration(
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

const baseImage = declaration(
  "declareBaseImage",
  `{
  applyParameter: () => \`FROM node:20-bookworm\`,
}`,
);

const harness = declaration(
  "declareHarness",
  `{
  applyParameter: (_config, ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}\`,
  cli: (ctx) => \`claude -p "\${ctx.initialPrompt}" --model \${ctx.modelId} > \${ctx.resultPath}\`,
  requiredEnv: ["ANTHROPIC_API_KEY"],
}`,
);

const harnessModels = declaration(
  "declareHarnessModels",
  `{
  "haiku-4-5": "claude-haiku-4-5-20251001",
}`,
);

const harnessVersions = declaration(
  "declareHarnessVersions",
  `{
  "2.1.283": { version: "2.1.283" },
}`,
);

const collectTokenCosts = declaration(
  "declareTokenCostCollector",
  `(_raw, _ctx) => {
  return { outcome: "unavailable", reason: "notReported" };
}`,
);

const initialPrompt = declaration(
  "declareInitialPrompt",
  `{
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
}`,
);

const measurement = declaration(
  "declareMeasurement",
  `{
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
}`,
);

const P = "test-case-parameters";

/**
 * The files `init` creates under `.thunderjar/`, keyed by their path in it, in the order it creates them.
 * `nestedPackage` is for a project without its own `package.json`: `.thunderjar/` gets one, with thunderjar as its dependency.
 */
export function scaffold({ nestedPackage }: { nestedPackage: boolean }): Record<string, string> {
  return {
    ...(nestedPackage && {
      "package.json": json({ name: "thunderjar-config", private: true, type: "module", dependencies: { thunderjar: "latest" } }),
    }),
    "tsconfig.json": tsconfig,
    ".gitignore": ["_generated/", ".data/", ...(nestedPackage ? ["node_modules/"] : [])].join("\n") + "\n",
    "thunderjar.config.ts": config,
    "test-cases/example.ts": testCase,
    [`${P}/baseImages/node20/index.ts`]: baseImage,
    [`${P}/codeStates/baseline/index.ts`]: declaration("declareCodeState", "{}"),
    [`${P}/promptSets/snerk/index.ts`]: declaration("declarePromptSet", "{}"),
    [`${P}/harnessModels/claude-code/index.ts`]: harness,
    [`${P}/harnessModels/claude-code/models.ts`]: harnessModels,
    [`${P}/harnessModels/claude-code/versions.ts`]: harnessVersions,
    [`${P}/harnessModels/claude-code/collectTokenCosts.ts`]: collectTokenCosts,
    [`${P}/tasks/is-prime/initial-prompts/plain.ts`]: initialPrompt,
    [`${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`]: measurement,
  };
}
