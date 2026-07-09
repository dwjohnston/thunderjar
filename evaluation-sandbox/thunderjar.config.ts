import { ThunderJarConfig } from '../src/ThunderJarConfig.ts';

const instruction =
    'Write a TypeScript function called `add` that takes two numbers and returns their sum. Save the file as add.ts. Put it in the output folder. Commit the changes.';

export default new ThunderJarConfig()
    .configure({
        testRunner: 'bun test',
        harnessWorkingDirectory: 'evaluation-sandbox',
        onWorktreeCreate: () => 'git config commit.gpgsign false',
    })
    .registerHarness({
        harnessName: 'claude-code',
        models: ['claude-haiku-4-5-20251001'],
        cli: (ctx) =>
            `claude -p "${ctx.taskInstruction}" --model ${ctx.model} --allowedTools "Write,Edit,Read,Bash" --append-system-prompt "You are running in headless (non-interactive) mode."`,
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
            `XDG_DATA_HOME=${ctx.worktreePath}/.opencode opencode run "${ctx.taskInstruction}" --model ${ctx.model} --dangerously-skip-permissions`,
    })
    .registerHarness({
        harnessName: 'cursor',
        models: ['composer-2.5', 'kimi-k2.5'],
        cli: (ctx) => `agent -p --force "${ctx.taskInstruction}" --model ${ctx.model}`,
    })
    .registerPromptSet({
        promptSetName: 'snerk',
        cli: () => 'cp evaluation-sandbox/prompts/base_prompt_snerk.md CLAUDE.md',
    })
    .registerPromptSet({
        promptSetName: 'glurk',
        cli: () => 'cp evaluation-sandbox/prompts/base_prompt_glurk.md CLAUDE.md',
    })
    .registerTask({
        taskName: 'add-function',
        instruction,
        measurements: [
            { measurerName: 'fileCreated', config: { glob: 'output/add.ts' } },
            {
                measurerName: 'grep',
                config: { glob: 'output/**', pattern: 'snerk', expect: 'present', scope: 'worktree' },
            },
        ],
    })

    .registerExperiment({
        experimentName: 'snerk-vs-glurk',
        taskName: 'add-function',
        commitHash: 'HEAD',
        variables: {
            harnesses: { 'claude-code': ['claude-haiku-4-5-20251001'] },
            promptSets: ['snerk', 'glurk'],
        },
    })
    .registerExperiment({
        experimentName: 'snerk-various-opencode',
        taskName: 'add-function',
        commitHash: 'HEAD',
        variables: {
            harnesses: {
                opencode: [
                    'opencode/deepseek-v4-flash-free',
                    'opencode/north-mini-code-free',
                    'opencode/claude-haiku-4-5',
                    'opencode/big-pickle',
                ],
            },
            promptSets: ['snerk'],
        },
    })
    .registerExperiment({
        experimentName: 'snerk-various-cursor',
        taskName: 'add-function',
        commitHash: 'HEAD',
        variables: {
            harnesses: { cursor: ['composer-2.5', 'kimi-k2.5'] },
            promptSets: ['snerk'],
        },
    })
    .construct();
