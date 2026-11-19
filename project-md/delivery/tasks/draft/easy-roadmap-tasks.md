<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiv51B9HBWKCShkWpU
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Plan: easy roadmap tasks

Small, independent tasks from `project-md/roadmap.md`, easiest first in each group.

Quick wins: 19. Prerequisites that unblock the most later work: 11, 1, 3–5.

## Helper functions

1. `codeStateGitCheckout`
   - A code state at a commit, a branch or a tag.
   - e.g.
     ```ts
     export default codeStateGitCheckout({ repo, commit: "530f477…" });
     export default codeStateGitCheckout({ repo, branch: "main" });
     export default codeStateGitCheckout({ repo, tag: "v0.4.0" });
     ```
   1. Config is `{ commit } | { branch } | { tag }`, with the other keys typed `never`.
      - A bare `ref` string would be ambiguous: `abc123` could be a branch.
   2. Branches and tags pin to a commit through `resolve`, with `git ls-remote` on the host.
      - The hash changes when the branch moves, so a stale image is never reused.
      - The run records the commit it resolved to.
      - Tags are peeled (`refs/tags/<tag>^{}`), so annotated tags give their commit.
   3. Fetches the commit directly (`git fetch origin <sha>`), not a plain clone.
      - Drops the "must be on a branch" caveat: squash-merged commits work, on hosts that allow it (GitHub does).
   4. Out of scope: a subfolder to start in, installing dependencies. Options for later.
   5. Then replace the hand-written fragments in `.thunderjar/parameters/codeStates/`.
2. `promptSetGitCheckout`
   - Same pattern as 1, for promptsets: copies the instruction files from a ref over the code state.
   - Open question: which files, and how they're selected.
3. `codex()` helper
   - Moves Codex's reply and token-cost parsing out of the project files and into `src/api`, matching `claudeCode`.
4. `copilot()` helper
   - Same as 3.
5. `opencode()` helper
   - Same as 3.

## Measurements (instruments)

Numbers are kept stable, so there are gaps.

These need the starting commit. The measurement container has no ref for it yet:

11. Tag the starting commit in the prerun image, e.g. a `thunderjar/start` ref.
    - The prerequisite for 12 and 14.

Both instruments share one type for a set of file changes:

```ts
/** Paths are relative to the workspace, like `glob` elsewhere. */
export type FileChanges = {
  added: string[];
  modified: string[];
  deleted: string[];
};
```

12. `commits`
    - The commits the agent made since the start, oldest first.
    - e.g.
      ```ts
      // InstrumentTypes
      commits: {
        config: {};
        value: Commit[];
      };

      export type Commit = {
        sha: string;
        /** The whole commit message. */
        message: string;
        /** What this commit changed, against its first parent. */
        files: FileChanges;
      };
      ```
    - e.g. red/green TDD: a 🔴 commit that only touches tests, then a 🟢 commit that only touches source.
      ```ts
      const touched = (c: Commit) => [...c.files.added, ...c.files.modified, ...c.files.deleted];
      const onlyTests = (c: Commit) => touched(c).every((f) => f.endsWith(".test.ts"));
      const noTests = (c: Commit) => touched(c).every((f) => !f.endsWith(".test.ts"));

      export default declareMeasurement({
        instrument: "commits",
        config: {},
        metrics: {
          redGreen: {
            stat: "rate",
            better: "higher",
            score: (v) =>
              v.length === 2 &&
              v[0].message.includes("🔴") && onlyTests(v[0]) &&
              v[1].message.includes("🟢") && noTests(v[1]),
          },
          commits: { stat: "mean", score: (v) => v.length },
        },
      });
      ```
    1. Only committed work. Uncommitted changes are `filesChanged`'s job.
    2. The count is `v.length`.
    3. The author is left out: in a run it's always the agent.
14. `filesChanged`
    - Everything changed since the start, committed or not, as one `FileChanges`.
    - e.g.
      ```ts
      // InstrumentTypes
      filesChanged: {
        config: {
          /** Only report paths matching this. Default: every path. */
          glob?: string;
        };
        value: FileChanges;
      };
      ```
    - e.g.
      ```ts
      export default declareMeasurement({
        instrument: "filesChanged",
        config: { glob: "src/**" },
        metrics: {
          didDeleteFoo: { stat: "rate", better: "higher", score: (v) => v.deleted.includes("src/foo/bar.js") },
          testUnchanged: { stat: "rate", better: "higher", score: (v) => !v.modified.includes("src/foo/bar.test.js") },
        },
      });
      ```
    1. Untracked files count as added; git-ignored files, e.g. `node_modules`, are left out.
    2. A rename is a deletion plus an addition, so `deleted.includes(...)` works as expected.
    3. In a workspace that isn't a git repository, the measurement fails with that reason.
    4. Then replace the hard-coded hash in `gauntlet-wrong-failing-test/measurements/testFileUnchanged.ts`.

These need configuring per harness, so they're harder:

16. `skillInvoked`
17. `toolCalled`
18. `conversationContains`

## CLI commands

19. Parameter overrides on `run`
    - Replace any of a test case's parameter lists for one execution, without editing the file.
    - e.g.
      ```sh
      thunderjar run compare-models --harness-model claude-code-2.1.326/haiku,opencode-1.19.5/haiku
      thunderjar run compare-models --code-state thunderjar-main --prompt-set none --iterations 3
      ```
    - One flag per field of the test case:
      - `--base-image`
      - `--code-state`
      - `--prompt-set`
      - `--harness-model`
      - `--initial-prompt`
      - `--iterations`
    1. A flag replaces that list; it doesn't add to it.
    2. Names are checked as the test case's are, e.g. an unknown code state fails before anything builds.
    3. `plan` and `build` take the same flags, so an override can be previewed.
    4. The execution records the overrides, so `show` and `executions` say it wasn't the test case as written.
    5. Out of scope: `--task`.
24. `purge capture`
    - Deletes captured sessions, in both stores: `refs/thunderjar/capture/<session>/*` and the `thunderjar/capture/<session>` branches.
    - A second command in the `purge` group, beside `purge image`, with the same shape.
    - e.g.
      ```sh
      thunderjar purge capture 6baafa46-f9af-5807-ac98-934c8715e118
      thunderjar purge capture --older-than 30d --from all
      thunderjar purge capture --verdict incomplete --dry-run
      ```
    - Selection, as `purge image` does it:
      - `[sessions...]`: full session IDs, as `capture list` shows them.
      - `--older-than <age>`: by when the session started, e.g. `30d`. Reuses `parseAge`.
      - `--all`
      - `--verdict <verdict>`: e.g. `incomplete` or `question`, from `capture list`. New, capture only.
    - `--from local|remote|all`, default `local`.
      - `remote` deletes on the remote with `git push <remote> --delete`, both stores' refs.
      - `--remote <name>`, default `origin`, as `capture push` takes it.
    - `-y`, `--dry-run`, `--json`, as `purge image` has them.
      - Lists the sessions it would delete, with verdict, age and prompt, and asks first.
    1. Remote selection reads the remote's refs (`git ls-remote`), so sessions never pulled locally can be purged too.
       - `--verdict` needs the records, so with `--from remote` it fetches them first. Or: `--verdict` is local only.
    2. Safe for test cases made from a capture: tj-create-from-capture tags the snapshot commit, and the tag keeps it.
    3. Doesn't touch `.thunderjar/quickCaptures/`.
    4. Open question: should it also run `git gc --prune=now`, so the objects go too? Default no: refs only.
25. `compare <a> <b>`
    - In the planned command table, but not built.
26. `remeasure <test case | execution>`
    - Applies the measurements on disk now to past container runs, without rerunning the agent.
    - e.g.
      ```sh
      thunderjar remeasure compare-models
      thunderjar remeasure 01K4X9J2E8MQZ3V7R5T0WABCDE
      ```
    - An execution remeasures its container runs; a test case, every past execution of it.
    - Each run is measured in a new measurement container from its postrun image, the same path as the original measurement.
    1. New measures are a new version, beside the old ones, not a replacement.
       - `show` uses the latest version.
    2. Runs whose postrun image was purged are skipped, and listed as skipped.
    3. Always runs every measurement. No selecting a subset.
    - Spec: `project-md/prd/100-cli-reference.md#remeasure`.
27. `checkout <run>`
    - Brings a container run's end state back, to inspect what happened.
    - Replaces the planned `restore` command.
    - e.g.
      ```sh
      thunderjar checkout <run>            # the run's end state as a local branch
      thunderjar checkout <run> --shell    # a shell inside its postrun image
      ```
    1. Default: a local branch.
       - The agent's commits, plus a commit of anything it left uncommitted, so the branch is the whole end state.
    2. `--shell`: `docker run -it` on the postrun image, in the workspace.
       - Through the configured runtime, so it works on a remote Docker host too.
       - Overlaps somewhat with `attach`, which follows a running execution.
    3. A purged postrun image fails with that reason.
    4. Open question: the branch name, e.g. `tj-run-<run>`, after the tag convention.
