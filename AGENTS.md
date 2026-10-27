# Use Bun

## Runtime APIs

✅ **Do** use Bun APIs and imports from `bun`.

❌ **Don't** import built-in APIs from `node:` modules.

**Why:** Keeping runtime-specific code on Bun avoids mixing incompatible APIs.

e.g.

```ts
// ✅ Do
import { file } from "bun";
const config = await file("config.json").json();

// ❌ Don't
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("config.json", "utf8"));
```

## CLI commands

✅ **Do** execute CLI commands with Bun's `$` shell.

❌ **Don't** use Node subprocess APIs.

**Why:** Bun's shell is the project's standard command runner.

e.g.

```ts
// ✅ Do
import { $ } from "bun";
await $`git status --short`;

// ❌ Don't
import { execSync } from "node:child_process";
execSync("git status --short");
```
