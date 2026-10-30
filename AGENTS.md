## Use Bun

The `node` APIs are banned. 

Use Bun's APIs instead.

```ts
// ✅ Do
import { file } from "bun";
const config = await file("config.json").json();

// ❌ Don't
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("config.json", "utf8"));
```

If needing to execute shell commands, use bun's `$` command.

```ts
// ✅ Do
import { $ } from "bun";
await $`git status --short`;

// ❌ Don't
import { execSync } from "node:child_process";
execSync("git status --short");
```

## Versioning while in 0.x

While the package is below 1.0.0, shift every changeset bump down one level.

| Change | Changeset type | Example from 0.1.0 |
|---|---|---|
| Breaking change | `minor` | 0.2.0 |
| New feature | `patch` | 0.1.1 |
| Bug fix | `patch` | 0.1.1 |

Never use `major` until we decide to release 1.0.0.

✅ **Do this**

```md
---
"thunderjar": patch
---

Add an `init` command.
```

❌ **Don't do that**

```md
---
"thunderjar": minor
---

Add an `init` command.
```

**Rationale:** Changesets applies bump types literally. It has no setting for 0.x, so a `minor` changeset for a new feature releases 0.2.0, and a `major` one releases 1.0.0. Under the 0.x convention, a minor version bump means a breaking change, so you have to choose the shifted type yourself.
