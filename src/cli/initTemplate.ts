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

export function computeRelativeImportPath(fromDir: string, toFile: string): string {
  let rel = path.relative(fromDir, toFile);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.split(path.sep).join('/');
}

const SUM_TASK_INSTRUCTION =
  'Write a JavaScript function called `sum` that takes two numbers and returns their sum. ' +
  "Add a comment directly above the function that includes the emoji '⚡'. " +
  'Save it as output/sum.js. ' +
  "Also write a test for it using Node's built-in `assert` module, saved as output/sum.test.js. " +
  'Commit the changes.';

export function buildInitConfigSource(thunderJarConfigImportPath: string): string {
  return `import { ThunderJarConfig } from '${thunderJarConfigImportPath}';

const sumInstruction =
${JSON.stringify(SUM_TASK_INSTRUCTION)};

export default new ThunderJarConfig()
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
  .registerPromptSet({
    promptSetName: 'default',
    cli: () => 'true',
  })
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
