// What `thunderjar init` writes into `.thunderjar/`: two runnable test cases, one comparing models
// and one comparing harnesses, the parameters they use, and a second prompt set to copy and edit.
import { STARTER_HARNESSES } from "./starterHarnesses.ts";

/** A repository to clone: its URL, and a commit of it. */
export type Repository = { url: string; commit: string };

const declaration = (fn: string, body: string) =>
  `import { ${fn} } from "thunderjar";\n\nexport default ${fn}(${body});\n`;

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const config = `import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  // Images stay in the local Docker daemon. To push them to a registry, name its repository,
  // e.g. { repository: "ghcr.io/your-org/thunderjar-images" }, and \`docker login\` to it.
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

// `allowImportingTsExtensions` because thunderjar ships its TypeScript source. A measurement's
// template named like `*.template.ts` isn't TypeScript until it's rendered (`init`'s own is `*.ts.template`).
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

// Two experiments on the is-prime task. Each varies one thing, so a difference in the measurements
// is down to it.
//
// The same harness, Claude Code, on two models.
const compareModels = `import { declareTestCase } from "thunderjar";

// The same harness on two models: Claude Code on Haiku 4.5, and on Haiku 5.5.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-4-5", "claude-code@2.1.283/haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`;

// The same model, Haiku 5.5, in three harnesses.
const compareHarnesses = `import { declareTestCase } from "thunderjar";

// The same model in three harnesses: Haiku 5.5 in Claude Code, GitHub Copilot CLI and OpenCode.
// Each harness needs its own key: ANTHROPIC_API_KEY, COPILOT_GITHUB_TOKEN and OPENCODE_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code@2.1.283/haiku-5-5", "copilot@1.0.105/haiku-5-5", "opencode@1.19.5/haiku-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`;

const baseImage = `import { declareBaseImage } from "thunderjar";

// With bun, which the templateTest measurement runs its tests with, and a git identity, so the
// agent and a prompt set can commit. \`--system\`, so a harness that runs as another user has it too.
export default declareBaseImage({
  applyParameter: () => \`FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\\\
  && git config --system user.email agent@thunderjar.invalid\`,
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

// Renders templates/isPrime.test.ts.template against the agent's isPrime.ts, runs it with `bun test`, and
// records how many tests pass and fail.
const templateTestMeasurement = declaration(
  "declareMeasurement",
  `{
  instrument: "templateTest",
  config: { subject: "**/isPrime.ts", template: "./templates/isPrime.test.ts.template" },
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

/** A code state's fragment that clones \`config.repo\` into /workspace at \`config.commit\`, detached, with no remote. */
const cloneFragment = `(config) => \`RUN git clone --quiet \${config.repo} /workspace \\\\
  && git -C /workspace checkout --quiet --detach \${config.commit} \\\\
  && git -C /workspace remote remove origin\``;

/**
 * Clones `repository.url` at `repository.commit`, the project's remote and commit when `init` ran,
 * or, without them, leaves `/workspace` empty, with how to clone one in a comment.
 */
const codeState = (repository: Repository | undefined) =>
  repository
    ? `import { declareCodeState } from "thunderjar";

// The project's repository, cloned into /workspace at a commit. The commit must be pushed, so the
// build can fetch it. Pin a commit, never a branch: the same text must always build the same thing.
export default declareCodeState({
  config: {
    repo: "${repository.url}",
    commit: "${repository.commit}",
  },
  applyParameter: ${cloneFragment},
});
`
    : `import { declareCodeState } from "thunderjar";

// An empty /workspace. The project had no pushed git repository when \`thunderjar init\` ran. To
// clone one into /workspace at a commit:
//
//   export default declareCodeState({
//     config: {
//       repo: "https://github.com/<owner>/<repo>.git",
//       commit: "<a commit hash>",
//     },
${cloneFragment
  .split("\n")
  .map((line, i) => `//     ${i === 0 ? "applyParameter: " : ""}${line}${i === cloneFragment.split("\n").length - 1 ? "," : ""}`)
  .join("\n")}
//   });
export default declareCodeState({});
`;

// Adds nothing, so the agent has only what the code state has.
const snerk = `import { declarePromptSet } from "thunderjar";

// Adds nothing: the agent works with whatever AGENTS.md and skills the code state has. To give it
// your own, put them in a files/ folder beside this file and copy them in, as house-style does.
export default declarePromptSet({});
`;

// Files kept beside the declaration, copied over /workspace and committed.
const houseStyle = `import { declarePromptSet } from "thunderjar";

// The files in this folder's files/, copied over /workspace and committed, so the agent's changes
// can be told from them. \`git add -A\`, not \`git commit -a\`, which skips new files such as a new
// skill. Use it with a code state that clones a repository, so /workspace is one.
export default declarePromptSet({
  applyParameter: (_config, ctx) => \`COPY \${ctx.dir}/ /workspace/
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
 * `repository` is the project's remote and the commit it is at, if it has them, for the code state to clone.
 */
export function scaffold({ nestedPackage, repository }: { nestedPackage: boolean; repository?: Repository }): Record<string, string> {
  return {
    ...(nestedPackage && {
      "package.json": json({ name: "thunderjar-config", private: true, type: "module", dependencies: { thunderjar: "latest" } }),
    }),
    "tsconfig.json": tsconfig,
    ".gitignore": ["_generated/", ".data/", ...(nestedPackage ? ["node_modules/"] : [])].join("\n") + "\n",
    "thunderjar.config.ts": config,
    "test-cases/compare-models.ts": compareModels,
    "test-cases/compare-harnesses.ts": compareHarnesses,
    [`${P}/baseImages/node20/index.ts`]: baseImage,
    [`${P}/codeStates/baseline/index.ts`]: codeState(repository),
    [`${P}/promptSets/snerk/index.ts`]: snerk,
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
    [`${P}/tasks/is-prime/measurements/templates/isPrime.test.ts.template`]: isPrimeTestTemplate,
    [`${P}/tasks/is-prime/measurements/tsIgnoreCount.ts`]: tsIgnoreCountMeasurement,
  };
}
