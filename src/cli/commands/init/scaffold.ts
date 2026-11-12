// What `thunderjar init` writes into `.thunderjar/`: two runnable test cases, one comparing models
// and one comparing harnesses, the parameters they use, and a second prompt set to copy and edit.
import { STARTER_FOLDERS, STARTER_HARNESSES } from "./starterHarnesses.ts";

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
  // Run results go to a local SQLite file. To share them between machines, e.g. CI and your
  // laptop, use a Postgres database instead, with its URL in an environment variable:
  //   runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL" }),
  // and import postgresStore from "thunderjar".
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
});
`;

// `allowImportingTsExtensions` because thunderjar ships its TypeScript source. A measurement's Bun
// test, like `isPrime.test.ts`, needs Bun's types: add `@types/bun` to type-check it too.
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
  exclude: ["node_modules", ".data", "**/*.test.ts"],
});

// Two experiments on the is-prime task. Each varies one thing, so a difference in the measurements
// is down to it.
//
// The same harness, Claude Code, on two models.
const compareModels = `import { declareTestCase } from "thunderjar";

// The same harness on two models: Claude Code on Haiku 4.5, and on Haiku 5.5. Each pair is a
// harness folder, then the model ID its agent is given.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["${STARTER_FOLDERS.claudeCode}/claude-haiku-4-5-20251001", "${STARTER_FOLDERS.claudeCode}/claude-haiku-5-5"],
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
  harnessModel: [
    "${STARTER_FOLDERS.claudeCode}/claude-haiku-5-5",
    "${STARTER_FOLDERS.copilot}/claude-haiku-5.5",
    "${STARTER_FOLDERS.opencode}/opencode/claude-haiku-5-5",
  ],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`;

const baseImage = `import { declareBaseImage } from "thunderjar";

// With bun, which the bunTestFile measurement runs its tests with, and a git identity, so the
// agent and a prompt set can commit. \`--system\`, so a harness that runs as another user has it too.
export default declareBaseImage({
  applyParameter: () => \`FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\\\
  && git config --system user.email agent@thunderjar.invalid\`,
});
`;

const initialPrompt = `import { declareInitialPrompt, writePrompt } from "thunderjar";

// Writes the prompt to /thunderjar/prompt.txt, for the harness's run script to pass to the agent.
export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file isPrime.ts exporting a function that tests for primality."),
  timeoutSeconds: 600,
});
`;

const measurement = declaration(
  "declareMeasurement",
  `{
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  metrics: { exists: { stat: "rate" } },
}`,
);

// Runs isPrime.test.ts against the agent's isPrime.ts with `bun test`, and records how many tests
// pass, of how many: its metric is the pass rate.
const bunTestFileMeasurement = declaration(
  "declareMeasurement",
  `{
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: { passRate: { stat: "mean" } },
}`,
);

// An ordinary Bun test. Measured, it imports the agent's file, from \`THUNDERJAR_SUBJECT\`; run
// yourself, with \`bun test\`, it imports the reference implementation beside it.
const isPrimeTest = `import { expect, test } from "bun:test";

const { isPrime }: typeof import("./isPrime.reference.ts") = await import(Bun.env.THUNDERJAR_SUBJECT ?? "./isPrime.reference.ts");

test("2 is prime", () => expect(isPrime(2)).toBe(true));
test("17 is prime", () => expect(isPrime(17)).toBe(true));
test("15 is not prime", () => expect(isPrime(15)).toBe(false));
test("0 is not prime", () => expect(isPrime(0)).toBe(false));
test("1 is not prime", () => expect(isPrime(1)).toBe(false));
`;

const isPrimeReference = `export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
`;

// How many \`@ts-ignore\`s the agent left. A count of 0 means none.
const tsIgnoreCountMeasurement = declaration(
  "declareMeasurement",
  `{
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  metrics: { count: { stat: "mean" } },
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

// One shell command whose stdout several metrics read.
const isPrimeShapeMeasurement = `import { declareMeasurement } from "thunderjar";

// What isPrime.ts looks like: one shell command, run once, prints JSON, and each metric reads
// it from the stored stdout.
const shape = (v: { exitCode: number; stdout: string }) =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as { lines: number; comments: number; exports: number }) : undefined;

export default declareMeasurement({
  instrument: "shell",
  config: {
    // Prints e.g. {"lines":3,"comments":2,"exports":1}. Exits non-zero when isPrime.ts is missing.
    command: String.raw\`node -e '
      const src = require("fs").readFileSync("isPrime.ts", "utf8").trimEnd();
      console.log(JSON.stringify({
        lines: src.split("\\n").length,
        comments: (src.match(/^\\s*\\/\\//gm) ?? []).length,
        exports: (src.match(/^export /gm) ?? []).length,
      }));'\`,
  },
  metrics: {
    lines: { score: (v) => shape(v)?.lines, stat: "median", better: "lower" },
    comments: { score: (v) => shape(v)?.comments, stat: "mean" },
    singleExport: { score: (v) => (shape(v) ? shape(v)!.exports === 1 : undefined), stat: "rate", better: "higher" },
  },
});
`;

const P = "parameters";

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
    ".gitignore": ["_generated/", ".data/", "logs/", ...(nestedPackage ? ["node_modules/"] : [])].join("\n") + "\n",
    "thunderjar.config.ts": config,
    "test-cases/compare-models.ts": compareModels,
    "test-cases/compare-harnesses.ts": compareHarnesses,
    [`${P}/baseImages/node20/index.ts`]: baseImage,
    [`${P}/codeStates/baseline/index.ts`]: codeState(repository),
    [`${P}/promptSets/snerk/index.ts`]: snerk,
    [`${P}/promptSets/house-style/index.ts`]: houseStyle,
    [`${P}/promptSets/house-style/files/AGENTS.md`]: houseStyleAgentsMd,
    ...Object.fromEntries(Object.entries(STARTER_HARNESSES).map(([harness, index]) => [`${P}/harnessModels/${harness}/index.ts`, index])),
    [`${P}/tasks/is-prime/initial-prompts/plain.ts`]: initialPrompt,
    [`${P}/tasks/is-prime/measurements/isPrimeTsExists.ts`]: measurement,
    [`${P}/tasks/is-prime/measurements/isPrimeTests.ts`]: bunTestFileMeasurement,
    [`${P}/tasks/is-prime/measurements/isPrime.test.ts`]: isPrimeTest,
    [`${P}/tasks/is-prime/measurements/isPrime.reference.ts`]: isPrimeReference,
    [`${P}/tasks/is-prime/measurements/isPrimeShape.ts`]: isPrimeShapeMeasurement,
    [`${P}/tasks/is-prime/measurements/tsIgnoreCount.ts`]: tsIgnoreCountMeasurement,
  };
}
