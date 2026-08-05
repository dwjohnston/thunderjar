/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-sonnet-5
 * Supervising engineer: David Johnston
 *
 * Level of human supervision: None (None is the default, but if in an interactive session with a human you can ask to elevate it)
 *
 *
 */

import path from 'node:path';

/**
 * `thunderjar init` writes its generated config into the *target* project, which lives
 * somewhere else on disk relative to this thunderjar checkout. Thunderjar isn't published
 * to npm (see package.json `private: true`), so the generated file can't `import
 * 'thunderjar'` — it has to import the actual `src/ThunderJarConfig.ts` file via a relative
 * path computed from wherever the target project happens to sit.
 *
 * `fromDir` is the target project's directory (where thunderjar.config.ts is being written).
 * `toFile` is the absolute path to this checkout's `src/ThunderJarConfig.ts`.
 *
 * node:path's `relative()` never adds a leading `./` for same-tree-or-below paths (e.g. it
 * returns `src/x.ts`, not `./src/x.ts`), and on Windows it joins with `\`. Both would produce
 * an invalid or non-portable ESM specifier, so both are corrected here.
 */
export function computeRelativeImportPath(fromDir: string, toFile: string): string {
  let rel = path.relative(fromDir, toFile);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.split(path.sep).join('/');
}

/**
 * The task instruction deliberately asks for two independently-checkable facts (the ⚡ emoji
 * in a comment, and use of node's `assert`) rather than "write a good sum function" — each
 * fact maps 1:1 to one of the `grep` measurements below, so this is the smallest possible
 * task that still exercises fileCreated + grep measurements end to end. See
 * docs/regular-usage-workflow.md for why measurements need to be this literal/mechanical
 * rather than judging code quality.
 */
const SUM_TASK_INSTRUCTION =
  'Write a JavaScript function called `sum` that takes two numbers and returns their sum. ' +
  "Add a comment directly above the function that includes the emoji '⚡'. " +
  'Save it as output/sum.js. ' +
  "Also write a test for it using Node's built-in `assert` module, saved as output/sum.test.js. " +
  'Commit the changes.';

/**
 * Builds the full source text of the `thunderjar.config.ts` that `init` writes into a new
 * project. `thunderJarConfigImportPath` is the value returned by
 * `computeRelativeImportPath()` above — the caller (src/cli/index.ts) is responsible for
 * resolving that path; this function just splices it into the generated import statement.
 *
 * Everything below is a *string template for a TypeScript file*, not TypeScript itself — the
 * outer function returns a big string that gets written to disk and later `import()`-ed by
 * the CLI. Two consequences fall out of that:
 *
 * 1. The harness `cli` callbacks are written using `'...' + ctx.x + '...'` string
 *    concatenation instead of the backtick template literals used in
 *    evaluation-sandbox/thunderjar.config.ts. That's purely to avoid escaping backticks and
 *    `${...}` inside the outer template literal that builds this string — the generated code
 *    behaves identically either way.
 * 2. `sumInstruction` is embedded via `JSON.stringify(...)`, not by hand-quoting, so any
 *    quotes/backslashes/emoji in SUM_TASK_INSTRUCTION are guaranteed to round-trip into valid
 *    TS source without the two of them getting out of sync.
 *
 * The harness list (claude-code / opencode / cursor, with their exact models and CLI
 * invocations) is copied from evaluation-sandbox/thunderjar.config.ts, since that's the
 * canonical "harnesses we currently have configured" — if that file's harness set changes,
 * this should be updated to match, at least until init generates that list dynamically
 * instead of hardcoding it (see the TODO at the bottom of this doc comment... i.e. there
 * isn't one yet — this is a known duplication).
 *
 * The `default` prompt set with a no-op `cli: () => 'true'` exists only so the generated
 * experiment is runnable: `generatePermutations()` in src/runner.ts nests
 * `harness -> model -> promptSet`, so an experiment with zero prompt sets produces *zero*
 * permutations regardless of how many harnesses/models it lists. The task itself was never
 * asked for a prompt set — this is scaffolding required by the runner's current shape, not a
 * feature of the sum-function task.
 */
export function buildInitConfigSource(thunderJarConfigImportPath: string): string {
  return `import { ThunderJarConfig } from '${thunderJarConfigImportPath}';

const sumInstruction =
${JSON.stringify(SUM_TASK_INSTRUCTION)};

export default new ThunderJarConfig()
  // Harnesses below are copied verbatim from evaluation-sandbox/thunderjar.config.ts —
  // see the doc comment on buildInitConfigSource for why, and for the caveat that this
  // list can drift out of sync with that file.
  .registerHarness({
    harnessName: 'claude-code',
    models: ['claude-haiku-4-5-20251001'],
    cli: (ctx) =>
      'claude -p "' + ctx.taskInstruction + '" --model ' + ctx.model +
      ' --allowedTools "Write,Edit,Read,Bash" --append-system-prompt "You are running in headless (non-interactive) mode."',
  })
  .registerHarness({
    harnessName: 'opencode',
    models: [
      'opencode/deepseek-v4-flash-free',
      'opencode/north-mini-code-free',
      'opencode/claude-haiku-4-5',
      'opencode/big-pickle',
    ],
    cli: (ctx) =>
      'XDG_DATA_HOME=' + ctx.worktreePath + '/.opencode opencode run "' + ctx.taskInstruction +
      '" --model ' + ctx.model + ' --dangerously-skip-permissions',
  })
  .registerHarness({
    harnessName: 'cursor',
    models: ['composer-2.5', 'kimi-k2.5'],
    cli: (ctx) => 'agent -p --force "' + ctx.taskInstruction + '" --model ' + ctx.model,
  })
  // No-op prompt set, required only because an experiment with zero prompt sets produces
  // zero runnable permutations (see src/runner.ts generatePermutations) — this task has no
  // actual prompt-set variation of its own.
  .registerPromptSet({
    promptSetName: 'default',
    cli: () => 'true',
  })
  // Two measurements per fact the instruction asks for: does the file exist, and does it
  // contain the marker proving the instruction was followed (⚡ comment / node:assert usage).
  .registerTask({
    taskName: 'sum-function',
    instruction: sumInstruction,
    measurements: [
      { measurerName: 'fileCreated', config: { glob: 'output/sum.js' } },
      { measurerName: 'fileCreated', config: { glob: 'output/sum.test.js' } },
      {
        measurerName: 'grep',
        config: { glob: 'output/sum.js', pattern: '⚡', expect: 'present', scope: 'worktree' },
      },
      {
        measurerName: 'grep',
        config: { glob: 'output/sum.test.js', pattern: 'assert', expect: 'present', scope: 'worktree' },
      },
    ],
  })
  // Every harness/model registered above, run against the one task, so 'bun run start' has
  // something to run immediately after 'thunderjar init' with no further editing required.
  .registerExperiment({
    experimentName: 'sum-function',
    taskName: 'sum-function',
    commitHash: 'HEAD',
    variables: {
      harnesses: {
        'claude-code': ['claude-haiku-4-5-20251001'],
        opencode: [
          'opencode/deepseek-v4-flash-free',
          'opencode/north-mini-code-free',
          'opencode/claude-haiku-4-5',
          'opencode/big-pickle',
        ],
        cursor: ['composer-2.5', 'kimi-k2.5'],
      },
      promptSets: ['default'],
    },
  })
  .construct();
`;
}
