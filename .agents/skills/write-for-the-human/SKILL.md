---
name: write-for-the-human
description: "Conventions for formatting general purpose text intended for human consumption. AGENTS.md, SKILL.md files, output of chat, etc"
---

# Write for the human 

AIs often have a hard-to-pinpoint style of writing that humans find exhausting. 

The following are guidelines to improve AI output.

Markdown prompts (SKILL.md and AGENTS.md files, for example) are written for human consumption. The human reads them, reviews them and maintains them, so they should read well.


### Use inline code sparingly

✅ **Do** use inline code only for literals the reader would type or search for verbatim: file paths, commands, identifiers, flags.

❌ **Don't** use it for concepts, emphasis or general terms.

**Why:** A page where every second phrase is highlighted is exhausting to read, and the highlighting stops meaning anything. When everything stands out, nothing does.

Bad:

```md
fails on any file under `src/` or `test/` that matches no entry's `allowedFiles`
```

Good:

```md
Fails on any linted file that matches no entry's `allowedFiles`.
```

`allowedFiles` stays highlighted because it is a literal name in the code. The folder names were incidental detail, so they became a general term.

### Don't name detail the reader doesn't need

✅ **Do** use a general term when the specifics aren't the point.

❌ **Don't** list every folder, file or value just because you know them.

**Why:** Specifics invite the reader to check them, and make the sentence go stale when they change.

### Use lists

#### Use numbered lists

If the context is you are likely receiving feedback/input from the user, use numbered lists.

This will allow the user to reference bullet points with numbers.

e.g.

````md
1. Untrack `meta-repo.local.yaml`
   - Remove it from git and add it to the ignore list.
   - e.g.
     ```sh
     git rm --cached meta-repo.local.yaml
     ```
2. Purge it from history
   - Rewrites every commit, so it needs a fresh clone.
3. Rotate the secrets it contained
   - Safe to do last, once the file is gone from the tip.
````

The reply is then "2 and 3, skip 1", rather than a paragraph describing which parts to do.

If there are multiple sub points: 

````md
2. Purge it from history
   1. Rewrites every commit, so everyone needs a fresh clone.
   2. Breaks any pull request that is already open.
   3. Has to be redone if the file comes back later.
````

Then the use can refer to `2.1` eg. 'Reword 2.1 - ....'.


#### Put descriptions on their own line

✅ **Do** put the path or name on one bullet and its description on a nested bullet beneath it.

❌ **Don't** join the two with a dash on a single line.

**Why:** Long one-line entries are hard to scan. Splitting them lets the eye run down the names first and read the descriptions only when needed.

Bad:

````md
- `scripts/layout.ts` — the layout as data: per folder, `allowedFiles` and `mayImport`
- `scripts/sync-oxlint-layout.ts` — writes `no-restricted-imports` and `unicorn/filename-case` overrides into the marked region of `.oxlintrc.json`
- `scripts/sync-oxlint-layout.ts --check` — fails on any file under `src/` or `test/` that matches no entry's `allowedFiles`
- `lint` script runs the sync, the check, then `oxlint`
- CI step that fails if the sync changes `.oxlintrc.json`
````

Good:

````md
- `scripts/layout.ts`
  - The layout as data: per folder, the files it may contain and the folders it may import from.
  - e.g.
    ```ts
    export const layout = {
      "src/cli": { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
      "src/commands": { allowedFiles: ["*.ts"], mayImport: ["src/adapters", "src/hashing"] },
      "src/adapters/docker": { allowedFiles: ["real.ts", "recording.ts", "index.ts"] },
    };
    ```
- `scripts/sync-oxlint-layout.ts`
  - Turns the layout into oxlint rules, written between the markers in `.oxlintrc.json`. Hand-written settings outside the markers are left alone.
  - e.g.
    ```jsonc
    {
      "rules": { "eqeqeq": "error" },                 // hand-written

      // sync-oxlint-layout: begin — generated, do not edit
      "overrides": [
        {
          "files": ["src/cli/*.ts"],
          "rules": {
            "no-restricted-imports": ["error", {
              "patterns": [{ "group": ["**/adapters/**"], "message": "src/cli may not import adapters" }]
            }]
          }
        }
      ]
      // sync-oxlint-layout: end
    }
    ```
- `scripts/sync-oxlint-layout.ts --check`
  - Fails on any linted file that matches no entry's `allowedFiles`, i.e. a file in the wrong place.
- `lint` script runs the sync, the check, then `oxlint`
- CI step that fails if the sync changes `.oxlintrc.json`
````

### Show an example

✅ **Do** follow a description with a short example code block, introduced with "e.g.".

❌ **Don't** leave a format, shape or structure described only in prose.

**Why:** Prose about a structure is slow to parse and easy to misread. An example is read at a glance, and the reader can check their understanding against it.

Pair the two: one line saying what the thing is, then the example. The line is the explainer; the example is the proof.

````md
- `scripts/layout.ts`
  - The layout as data: per folder, the files it may contain and the folders it may import from.
  - e.g.
    ```ts
    export const layout = {
      "src/cli": { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
    };
    ```
````


## Less is more 

AIs tend to over explain things. It's possibly a function of how their reasoning works. 

Err on the side of brevity. If the user needs more details, they will ask for it.

<!-- needs example -->
