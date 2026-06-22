# Harness vs Models — Design Decision

The current `variables: { models, harnesses, prompts }` structure generates all permutations, which produces invalid combinations — e.g. `opencode` with a claude model ID, or `claude-code` with an opencode model ID.

## Option A — harness+model as explicit pairs (`agents`)

```typescript
variables: {
  agents: [
    { harness: 'claude-code', model: 'claude-haiku-4-5-20251001' },
    { harness: 'opencode', model: 'opencode/deepseek-v4-flash-free' },
  ],
  prompts: ['snerk', 'glurk'],
}
```

Permutations become `agents × prompts`. Explicit, no invalid combos possible.

## Option B — models nested under each harness

```typescript
variables: {
  harnesses: {
    'claude-code': ['claude-haiku-4-5-20251001'],
    'opencode': ['opencode/deepseek-v4-flash-free', 'opencode/north-mini'],
  },
  prompts: ['snerk', 'glurk'],
}
```

Permutations become `(harness × its models) × prompts`. More compact when comparing many models within the same harness.

## Preference

Option A is the more honest representation of what a run actually is (one agent, one prompt) and makes it easier to read what will be compared. Option B is more compact for multi-model-per-harness comparisons.
