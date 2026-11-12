<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLku3njWFHedFBQJ6Mb
Supervising engineer: David Johnston

Humans: add your notes here
-->

# .thunderjar

This folder dogfoods thunderjar on its own repo.

## Import from `thunderjar-published`, not `thunderjar`

✅ Do:

```ts
import { declareTestCase } from "thunderjar-published";
```

❌ Don't:

```ts
import { declareTestCase } from "thunderjar";
```

`thunderjar-published` is an npm alias devDependency in the root `package.json`:

```json
"thunderjar-published": "npm:thunderjar@<version>"
```

Why: Changesets rewrites any dependency named `thunderjar` to the version it's about to release. That version isn't on npm yet, so `bun install` fails on the release PR. The alias has a different name and an `npm:` range, so Changesets leaves it alone.

To dogfood a newer release, bump the version in that alias by hand.

## Gauntlet test cases

`test-cases/gauntlet-*.ts` set agents the challenges in `src/gauntlet/`, in this repository with its everyday AGENTS.md and skills. Their code state, `thunderjar-gauntlet`, pins the commit that added the challenges, from before their tasks were added here, so the agent can't read the measurements.

Run one remotely, from the repository root, with the CLI from source:

```sh
THUNDERJAR_REMOTE=1 bun src/cli/index.ts run gauntlet-wrong-failing-test                  # 1 iteration
THUNDERJAR_REMOTE=1 bun src/cli/index.ts run gauntlet-wrong-failing-test --iterations 5   # 5 iterations
```

It needs `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and what the remote config in `thunderjar.config.ts` needs: `FLYIO_TOKEN`, `THUNDERJAR_DB_URL`, a `docker login ghcr.io` that can push, and the `fly` CLI.
