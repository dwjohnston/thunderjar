# 0001: Restore the lint gate

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md).

This is a prerequisite for delivering the story in small increments with passing checks. Assessment found that `bun run typecheck` and `bun test` pass (231 passed, 16 Docker tests skipped), but `bun run lint` fails before any story changes:

```text
ralph/ralph.ts:7:10: error eslint(no-unused-vars): Identifier 'existsSync' is imported but never used.
```

Read the root `AGENTS.md`. The story's verification requirements are in [How to test](/workspace/thunderjar2/delivery/2400_remeasure.md#how-to-test); test boundaries are in [120](/workspace/thunderjar2/spec/120-test-boundaries.md#principles).

✅ Remove the unused `existsSync` import from `ralph/ralph.ts`.

❌ Don't alter loop behaviour, suppress the lint rule, or add a test for an unused import. The existing lint command directly verifies this change.

## Done when

`bun run lint`, `bun run typecheck`, and `bun test` pass. The only implementation change is removing this unused import. Commit the change following the repository's commit conventions.
