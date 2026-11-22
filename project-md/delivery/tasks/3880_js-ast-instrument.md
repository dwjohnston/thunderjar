---
harness: claude-code
model: sonnet
effort: medium
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLjJ93DfxJz1Jcn8net
Supervising engineer: David Johnston

From the review of PR #250.

Humans: add your notes here
-->

# 3880: `jsAst` instrument

Matches a selector against the syntax tree of JavaScript and TypeScript files, so a measurement can check the structure of code, not just its lines. For example: "the tag is named inside `resolve`".

Needs 3875 (`measure()`), for its tests.

## Naming

Thunderjar isn't specific to JavaScript. Each parser parses one language family, so the instrument's name says which one: `jsAst`, covering JS, TS, JSX and TSX. A later parser for another language gets an instrument of its own, e.g. `pythonAst`, rather than options on this one.

## Version bump type

patch

## Artifacts

Adds the `jsAst` instrument, parsing with [`oxc-parser`](https://www.npmjs.com/package/oxc-parser) and matching with [`esquery`](https://www.npmjs.com/package/esquery). Both are new runtime `dependencies`.

```ts
// InstrumentTypes
jsAst: {
  config: {
    /** The files to parse, relative to the workspace. */
    glob: string;
    /** esquery selectors, as in ESLint's `no-restricted-syntax`, by a name of your choosing. */
    selectors: Record<string, string>;
  };
  /** One entry per file the glob matches, sorted by path: how many nodes each selector matched. */
  value: { file: string; matches: Record<string, number>; parseError?: string }[];
};
```

1. Its logic runs on the host, reading files through the context, like `grep`. It doesn't need anything in the image.
2. A file's language comes from its extension: `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`. Any other matched file gives `erroredWhileMeasuring`, naming the file.
3. Several named selectors let a score compare counts within a file, e.g. "every file that names the tag names it in `resolve`".
4. A file that doesn't parse gets a count of 0 for each selector, and `parseError`, and the rest are still measured. An agent's code can be broken, and that's something to score, not an error in the measurement.
5. No matching file gives `measured` with `[]`, not `skipped`. Then a `score` can decide what no file means.
6. `checkConfig` reports an empty `selectors`, and each selector that esquery can't parse, as `config.selectors.<name>`.
7. There's no default score: each metric needs a `score`, like `commits`.
8. Add it to the instrument docs table in `src/api/declarations.ts`, and to the lists of known instruments that tests hard-code.

## Migrate `codeStateUsesTag`

Move `.thunderjar/parameters/tasks/tj-eval-blacksheepcode/measurements/codeStateUsesTag.ts` onto `jsAst`. Keep the metric `usesTag` and its tests in `measurements/tests/`, which all pass unchanged.

```ts
const TAG = "/tj-codestate-1/";
const NAMES_TAG = `:matches(Literal[value=${TAG}], TemplateElement[value.cooked=${TAG}])`;

export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/parameters/codeStates/*/index.ts",
    selectors: { anywhere: NAMES_TAG, inResolve: `Property[key.name="resolve"] ${NAMES_TAG}` },
  },
  metrics: {
    usesTag: {
      stat: "rate",
      better: "higher",
      score: (v) => {
        const naming = v.filter((f) => f.matches.anywhere > 0);
        return naming.length > 0 && naming.every((f) => f.matches.inResolve > 0);
      },
    },
  },
});
```

- A template string's text is at `value.cooked`, not `value`. `index_good.ts` names the tag in a template string.
- Check the selectors against the fixtures before relying on them, e.g. that `resolve` written as a method (`resolve() {}`) is a `Property` too.

## Tests

- Unit tests with `measure()`, one behaviour each:
  - a selector match in a `.ts` file, then in a `.tsx` file
  - per-file counts across several files, for two named selectors
  - a file that doesn't parse gets `parseError`
  - no matching file gives `[]`
  - an unsupported extension errors
  - an invalid selector is a config problem
- The `codeStateUsesTag` tests, unchanged.
- `bun run test:package` still passes, so the native `oxc-parser` binary installs with the package.

## Human interventions

None.
