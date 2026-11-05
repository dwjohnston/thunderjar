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

const harness = `import { claudeCodeReply, declareHarness } from "thunderjar";

// Claude Code, installed as root, then run as the image's non-root \`node\` user: it won't skip its
// permission prompts as root, and nobody is there to answer them.
export default declareHarness({
  applyParameter: (_config, ctx) => \`RUN npm install -g @anthropic-ai/claude-code@\${ctx.version}
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node\`,
  // The prompt is read from its file, so quotes and newlines reach the agent intact. Turn 0 starts
  // the session, and any later turn resumes it.
  cli: (ctx) =>
    \`claude -p "$(cat \${ctx.promptPath})" --model \${ctx.modelId} --output-format json --dangerously-skip-permissions\` +
    \` \${ctx.turn === 0 ? "--session-id" : "--resume"} \${ctx.sessionId} > \${ctx.resultPath}\`,
  collectReply: claudeCodeReply,
  requiredEnv: ["ANTHROPIC_API_KEY"],
});
`;

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

// Claude Code's \`--output-format json\` result, read by the library's own reader.
const collectTokenCosts = `import { claudeCodeTokenCosts, declareTokenCostCollector } from "thunderjar";

export default declareTokenCostCollector((raw) => claudeCodeTokenCosts(raw));
`;

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
