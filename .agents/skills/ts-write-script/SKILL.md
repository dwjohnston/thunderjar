---
name: ts-write-script
description: By default - use TypeScript to write scripts. 
---


## Endorsed tools

It's up to the user whether these tools should be used. 

- .env files 
  - Bun resolves .env files automatically
  - for node use [dotenv](https://www.npmjs.com/package/dotenv)
- env var validation
  - [envalid](https://www.npmjs.com/package/envalid)
- arguments validation
  - [commander](https://www.npmjs.com/package/commander)


## Script structure

Scripts should be ordered as following

```
<shebang>
<ai content header>
<imports>
<constants>
<help function>
<main guard>
<main function>
<associated functions>
```

## Include a `help` function at the top of the file
At the top of the file, below the imports, add a function that serves to describe what the function does, and its usage. 

This does two jobs: it documents the script for whoever reads the file, and it is what the script prints for `--help` or when arguments are wrong. 

```ts
import { parseArgs } from "node:util";

function help() {
  console.log(`
Count the lines in a text file and print the total to stdout.
Blank lines are included unless --skip-blank is passed.

Usage:
  bun count-lines.ts <file> [--skip-blank]

Arguments:
  <file>         Path to a text file (relative to the current directory)

Options:
  --skip-blank   Do not count empty lines
  -h, --help     Show this message

Example:
  bun count-lines.ts notes.md --skip-blank
`);
}

```

### Alternative: `commander`

With `commander`, the `Command` block replaces both `help` and the argument parsing. Its description, arguments and options become the `--help` output, and it rejects bad usage for you.

```ts
import { Command } from "commander";

if (import.meta.main) {
  new Command()
    // 👇
    .description("Count the lines in a text file and print the total to stdout.")
    .argument("<file>", "path to a text file (relative to the current directory)")
    .option("--skip-blank", "do not count empty lines")
    .addHelpText("after", "\nExample:\n  bun count-lines.ts notes.md --skip-blank")
    .action((file: string, opts: { skipBlank?: boolean }) => main(file, opts.skipBlank))
    .parse();
}
```

Include a `// 👇` comment. This will help draw the eye of the human to a useful start point.


## Reference files relative to scripts location

Do not reference files relative to the current working directory. 

**Rationale:** You can't assume that a script will be being executed from a specific location, like the project root. 

Example project structure:

```text
my-project/
  data/
    config.json
  scripts/
    build-report.ts
```

```ts
// 👎 Bad
// scripts/build-report.ts
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("data/config.json", "utf8"));
```

```ts
// 👍 Good
// scripts/build-report.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync(join(import.meta.dirname, "../data/config.json"), "utf8"));
```

### Exception: a path passed as a script argument is relative to the CWD

A path the user types on the command line follows normal shell expectations, so resolve it against the CWD.

```ts
// bun scripts/build-report.ts ./out/report.md
import { resolve } from "node:path";

const outputPath = resolve(process.cwd(), outputArg);
```


## Make the script a runnable module / include a main guard

The main guard block should: 
- Validate environment variables
- Validate script arguments
- Pass these into the main function


The main function itself should be exported 

**Rationale:** This lends the script functioanlity to be testable

```ts
import { parseArgs } from "node:util";
import { cleanEnv, str } from "envalid";


if (import.meta.main) {
  const env = cleanEnv(process.env, { API_TOKEN: str() });

  const { positionals } = parseArgs({ allowPositionals: true });
  const [file] = positionals;
  if (!file) {
    console.error("Missing <file> argument.");
    help();
    process.exit(1);
  }

  main(file, env.API_TOKEN);
}

export function main(file: string, apiToken: string) {
  // ...
}

```

Because `main` is exported and takes plain values, a test can import it and call it directly, without setting environment variables or `process.argv`.


## Declare default values as constants

Declare them in the constants section, between the imports and `help`, so `help()` can interpolate them.

**Rationale:** Defaults can get lost in default assignments

```ts
// 👍 Good
const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 5000;

export function main(file: string, limit = DEFAULT_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // ...
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { limit: { type: "string" } } });
  main(file, values.limit ? Number(values.limit) : DEFAULT_LIMIT);
}
```

```ts
// 👎 Bad
export function main(file: string, limit = 100, timeoutMs = 5000) {
  // ...
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { limit: { type: "string" } } });
  main(file, Number(values.limit ?? 100));
}
```

The constants can also be interpolated into `help()`, so the documented default always matches the real one.

## By default, fail loud and early on missing environment variables or arguments 

Only assign defaults if they're sensible. 

Don't invent a default for a value just for the purpose of making the script run. 

**Rationale:** A wrong guess can quietly point the script at the wrong place. Failing late leaves the work half done and hides the real cause.

```ts
// 👍 Good
if (import.meta.main) {
  const env = cleanEnv(process.env, { API_URL: str(), API_TOKEN: str() });

  main(env.API_URL, env.API_TOKEN);
}
```

```ts
// 👎 Bad
if (import.meta.main) {
  const apiUrl = process.env.API_URL ?? "https://api.example.com";
  const apiToken = process.env.API_TOKEN ?? "";

  main(apiUrl, apiToken);
}
```

A default is fine when it is safe and obvious, such as `DEFAULT_LIMIT` above.


## By default, fail loud

**Rationale:** A logged message is easy to miss, and the script exits 0 as if nothing went wrong. The missing item silently drops out of the result.

```ts
// 👍 Good
export async function main() {
  const items = await fetchItems();

  for (const item of items) {
    if (!item.id) {
      throw new Error(`Item is missing an id: ${JSON.stringify(item)}`);
    }
    await processItem(item.id);
  }
}
```

```ts
// 👎 Bad
export async function main() {
  const items = await fetchItems();

  for (const item of items) {
    if (!item.id) {
      console.log("Item is missing an id", item);
      continue;
    }
    await processItem(item.id);
  }
}
```
