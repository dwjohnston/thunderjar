import { defineConfig } from '../src/defineConfig.ts';

export default defineConfig({
    commands: {
        testRunner: 'bun test',
        harnesses: {
            'claude-code': 'claude -p "$THUNDERJAR_PROMPT" --model {model} --allowedTools "Write,Edit,Read,Bash" --append-system-prompt "You are running in headless (non-interactive) mode."',
        },
    },

    tasks: {
        'add-function': {
            description: 'Write a TypeScript add function in the output folder',
            prompt: 'Write a TypeScript function called `add` that takes two numbers and returns their sum. Put it in the output folder.',
            measurements: [
                { type: 'fileCreated', glob: 'output/**' },
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
    },
});
