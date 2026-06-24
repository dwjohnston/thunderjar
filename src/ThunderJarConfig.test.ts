import { describe, expect, it } from "bun:test"
import { ThunderJarConfig } from "./ThunderJarConfig"

describe(ThunderJarConfig, () => {
    it("accepts registrations in the correct order", () => {
        const config = new ThunderJarConfig()
            .configure({
                testRunner: 'bun test',
                onWorktreeCreate: () => 'git config commit.gpgsign false',
                harnessWorkingDirectory: 'evaluation-sandbox',
            })
            .registerMeasurer<{ glob: string }, boolean>({
                measurerName: 'file-present',
                evaluate: async (_config, _context) => ({ outcome: 'measured', data: true }),
            })
            .registerHarness({
                harnessName: 'claude-code',
                models: ['claude-haiku-4-5-20251001'],
                cli: (ctx) => `claude -p "${ctx.taskInstruction}" --model ${ctx.model}`,
            })
            .registerPromptSet({
                promptSetName: 'snerk',
                cli: (_ctx) => 'cp prompts/snerk.md CLAUDE.md',
            })
            .registerTask({
                taskName: 'add-function',
                instruction: 'Write a TypeScript add function',
                measurements: [
                    { measurerName: 'file-present', config: { glob: 'output/add.ts' } },
                ],
            })
            .registerExperiment({
                experimentName: 'snerk-experiment',
                taskName: 'add-function',
                commitHash: 'HEAD',
                variables: {
                    harnesses: { 'claude-code': ['claude-haiku-4-5-20251001'] },
                    promptSets: ['snerk'],
                },
            })
            .construct()

        expect(config).toBeDefined()
    })

    it("prevents referencing unregistered names in registerExperiment", () => {
        new ThunderJarConfig()
            .registerMeasurer<{ glob: string }, boolean>({
                measurerName: 'file-present',
                evaluate: async (_config, _context) => ({ outcome: 'measured', data: true }),
            })
            .registerHarness({
                harnessName: 'claude-code',
                models: ['claude-haiku-4-5-20251001'],
                cli: (ctx) => `claude --model ${ctx.model}`,
            })
            .registerPromptSet({
                promptSetName: 'snerk',
                cli: () => 'cp prompts/snerk.md CLAUDE.md',
            })
            .registerTask({
                taskName: 'add-function',
                instruction: 'Write a TypeScript add function',
                measurements: [
                    { measurerName: 'file-present', config: { glob: 'output/add.ts' } },
                    // @ts-expect-error — config does not match measurer's registered shape
                    { measurerName: 'file-present', config: { path: 'output/add.ts' } },
                    // @ts-expect-error — 'nonexistent-measurer' has not been registered
                    { measurerName: 'nonexistent-measurer', config: {} },
                ],
            })
            .registerExperiment({
                experimentName: 'test',
                taskName: 'add-function',
                commitHash: 'HEAD',
                variables: {
                    // @ts-expect-error — 'cursor' has not been registered as a harness
                    harnesses: { 'cursor': ['some-model'] },
                    // @ts-expect-error — 'cursor' has not been registered as a harness
                    promptSets: ['zzzz'],
                },
            })
            .construct()
    })
})
