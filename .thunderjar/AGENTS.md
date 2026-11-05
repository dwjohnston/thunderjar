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
