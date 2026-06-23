import { defineConfig } from '../src/defineConfig.ts';

export default defineConfig({
    commands: {
        testRunner: 'bun test',
        harnessWorkingDirectory: 'evaluation-sandbox',
        onWorktreeCreate: 'git config commit.gpgsign false',
        harnesses: {
            'claude-code': 'claude -p "$THUNDERJAR_PROMPT" --model {model} --allowedTools "Write,Edit,Read,Bash" --append-system-prompt "You are running in headless (non-interactive) mode."',
            'opencode': 'opencode run "$THUNDERJAR_PROMPT" --model {model} --dangerously-skip-permissions',
            'cursor': 'agent -p --force "$THUNDERJAR_PROMPT" --model {model}',
        },
    },

    tasks: {
        'add-function': {
            description: 'Write a TypeScript add function in the output folder',
            prompt: 'Write a TypeScript function called `add` that takes two numbers and returns their sum. Save the file as add.ts. Put it in the output folder. Commit the changes.',
            measurements: [
                { type: 'fileCreated', glob: 'output/add.ts' },
                { type: 'grep', glob: 'output/**', pattern: 'snerk', expect: 'present', scope: 'worktree' },
            ],
        },
    },

    prompts: {
        snerk: { apply: 'cp evaluation-sandbox/prompts/base_prompt_snerk.md CLAUDE.md' },
        glurk: { apply: 'cp evaluation-sandbox/prompts/base_prompt_glurk.md CLAUDE.md' },
    },

    experiments: {
        'snerk-vs-glurk': {
            description: 'Compare snerk and glurk prompt approaches on a simple task',
            taskId: 'add-function',
            commitHash: 'HEAD',
            variables: {
                models: ['claude-haiku-4-5-20251001'],
                harnesses: ['claude-code'],
                prompts: ['snerk', 'glurk'],
            },
        },
        'snerk-various-opencode': {
            description: 'Run snerk with various opencode models',
            taskId: 'add-function',
            commitHash: 'HEAD',
            variables: {
                models: ['opencode/deepseek-v4-flash-free', 'opencode/north-mini-code-free', 'opencode/claude-haiku-4-5', 'opencode/big-pickle'],
                harnesses: ['opencode'],
                prompts: ['snerk'],
            },
        },
        'snerk-various-cursor': {
            description: 'Run snerk with various cursor models',
            taskId: 'add-function',
            commitHash: 'HEAD',
            variables: {
                models: ['composer-2.5', 'kimi-k2.5'],
                harnesses: ['cursor'],
                prompts: ['snerk'],
            },
        },
    },
});
