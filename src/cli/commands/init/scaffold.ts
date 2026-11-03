// What `thunderjar init` writes into `.thunderjar/`: a runnable example test case, the parameters
// it uses, and starter parameters to copy and edit: a second prompt set, and more harnesses.
import { STARTER_HARNESSES } from "./starterHarnesses.ts";

const declaration = (fn: string, body: string) =>
  `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const config = `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/your-org/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

// `allowImportingTsExtensions` because thunderjar ships its TypeScript source. A measurement's
// template, like `isPrime.test.template.ts`, isn't TypeScript until it's rendered.
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
  exclude: ["node_modules", ".data", "**/*.template.ts"],
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

const baseImage = `import { declareBaseImage } from "thunderjar";

// With bun, which the templateTest measurement runs its tests with.
export default declareBaseImage({
  applyParameter: () => \`FROM node:20-bookworm
RUN npm install --global bun@1.3.14\`,
});
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

// Renders isPrime.test.template.ts against the agent's isPrime.ts, runs it with `bun test`, and
// records how many tests pass and fail.
const templateTestMeasurement = declaration(
  "declareMeasurement",
  `{
  instrument: "templateTest",
  config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" },
  aggregate: ["sum", "mean"],
}`,
);

// \`{{defaultExport}}\` and \`{{subjectPath}}\` are filled in from the agent's file, whatever it names its function.
const isPrimeTestTemplate = `import { {{defaultExport}} } from "{{subjectPath}}";

test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));
test("17 is prime", () => expect({{defaultExport}}(17)).toBe(true));
test("15 is not prime", () => expect({{defaultExport}}(15)).toBe(false));
test("0 is not prime", () => expect({{defaultExport}}(0)).toBe(false));
test("1 is not prime", () => expect({{defaultExport}}(1)).toBe(false));
`;

// How many \`@ts-ignore\`s the agent left. A count of 0 means none; \`max\` shows whether any run had one.
const tsIgnoreCountMeasurement = declaration(
  "declareMeasurement",
  `{
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  aggregate: ["mean", "max"],
}`,
);

/**
 * Checks out `head`, the project's commit when `init` ran, or, outside a git repository, leaves
 * `/workspace` empty, with how to check one out in a comment.
 */
const codeState = (head: string | undefined) =>
  head
    ? `import { checkoutCommit, declareCodeState } from "thunderjar";

// The project's repository at a commit, checked out into /workspace. The commit must be in the
// repository: commit it, or Thunderjar can't build it.
export default declareCodeState({
  config: { commit: "${head}" },
  applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),
});
`
    : `import { declareCodeState } from "thunderjar";

// An empty /workspace. The project wasn't a git repository when \`thunderjar init\` ran. Once it is,
// check a commit of it out into /workspace:
//
//   import { checkoutCommit, declareCodeState } from "thunderjar";
//
//   export default declareCodeState({
//     config: { commit: "<a commit hash>" },
//     applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),
//   });
export default declareCodeState({});
`;

/** Copies files from a commit: `git checkout <commit> -- <paths>`, without needing the commit in /workspace. */
const snerk = (head: string | undefined) => `import { declarePromptSet } from "thunderjar";

// Files from a commit of the project's repository, such as its AGENTS.md or skills, copied into
// /workspace at the same paths, like \`git checkout <commit> -- <paths>\`. They're left uncommitted.
// Each path is from the repository's root, e.g. "AGENTS.md" or ".agents/skills/review/SKILL.md".
export default declarePromptSet<{ commit: string; paths: string[] }>({
  config: {
    commit: "${head ?? "<a commit hash>"}",
    paths: [],
  },
  applyParameter: (config, ctx) =>
    config.paths.map((path) => \`COPY \${ctx.git.show(config.commit, path)} /workspace/\${path}\`).join("\\n"),
});
`;

// Files kept beside the declaration, copied over /workspace and committed.
const houseStyle = `import { declarePromptSet } from "thunderjar";

// The files in this folder's files/, copied over /workspace and committed, so the agent's changes
// can be told from them. \`git add -A\`, not \`git commit -a\`, which skips new files such as a new
// skill. Use it with a code state that checks out a commit, so /workspace is a git repository.
export default declarePromptSet({
  applyParameter: (_config, ctx) => \`COPY \${ctx.dir}/files/ /workspace/
RUN cd /workspace && git add -A && git commit --quiet -m "Thunderjar: apply promptSet"\`,
});
`;

const houseStyleAgentsMd = `# House style

- Write TypeScript, with strict types.
- Add a test beside each new module.
`;

const P = "test-case-parameters";

/**
 * The files `init` creates under `.thunderjar/`, keyed by their path in it, in the order it creates them.
 * `nestedPackage` is for a project without its own `package.json`: `.thunderjar/` gets one, with thunderjar as its dependency.
 * `head` is the commit the project's repository is at, if it is in one, for the code state and prompt set to start from.
 */
export function scaffold({ nestedPackage, head }: { nestedPackage: boolean; head?: string }): Record<string, string> {
  return {
    ...(nestedPackage && {
      "package.json": json({ name: "thunderjar-config", private: true, type: "module", dependencies: { thunderjar: "latest" } }),
    }),
    "tsconfig.json": tsconfig,
    ".gitignore": ["_generated/", ".data/", ...(nestedPackage ? ["node_modules/"] : [])].join("\n") + "\n",
    "thunderjar.config.ts": config,
    "test-cases/example.ts": testCase,
    [`${P}/baseImages/node20/index.ts`]: baseImage,
    [`${P}/codeStates/baseline/index.ts`]: codeState(head),
    [`${P}/promptSets/snerk/index.ts`]: snerk(head),
    [`${P}/promptSets/house-style/index.ts`]: houseStyle,
    [`${P}/promptSets/house-style/files/AGENTS.md`]: houseStyleAgentsMd,
    ...Object.fromEntries(
      Object.entries(STARTER_HARNESSES).flatMap(([harness, files]) =>
        Object.entries(files).map(([file, content]) => [`${P}/harnessModels/${harness}/${file}`, content]),
      ),
    ),
    [`${P}/tasks/is-prime/initial-prompts/plain.ts`]: initialPrompt,
    [`${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`]: measurement,
    [`${P}/tasks/is-prime/measurements/isPrimeTemplateTest.ts`]: templateTestMeasurement,
    [`${P}/tasks/is-prime/measurements/isPrime.test.template.ts`]: isPrimeTestTemplate,
    [`${P}/tasks/is-prime/measurements/tsIgnoreCount.ts`]: tsIgnoreCountMeasurement,
  };
}
