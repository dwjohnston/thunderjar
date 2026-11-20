---
harness: claude-code
model: opus
effort: medium
ralph:
  session: "72b33e15-7386-49b2-b59e-8e95b06bc03c"
  capture: "thunderjar/capture/72b33e15-7386-49b2-b59e-8e95b06bc03c"
  branchedFrom: "ralph/4700_run-parameter-overrides"
  date: "2026-11-20T06:30:15.149Z"
  costUsd: 2.4126416000000006
  durationMs: 499377
  isError: false
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
Supervising engineer: David Johnston

Split from PR #218's roadmap plan.

Humans: add your notes here
-->

# 4800: `purge capture`

Delete captured sessions, in both stores: `refs/thunderjar/capture/<session>/*` and the `thunderjar/capture/<session>` branches.

Roadmap item 24. A second command in the `purge` group, beside `purge image`, with the same shape.

## Version bump type

minor

## Artifacts

Adds `purge capture`.

- Selection, as `purge image` does it:
  - `[sessions...]`: full session IDs, as `capture list` shows them.
  - `--older-than <age>`: by when the session started, e.g. `30d`. Reuses `parseAge`.
  - `--all`
  - `--verdict <verdict>`: e.g. `incomplete` or `question`, from `capture list`. Capture only.
- `--from local|remote|all`, default `local`.
  - `remote` deletes on the remote with `git push <remote> --delete`, both stores' refs.
  - `--remote <name>`, default `origin`, as `capture push` takes it.
- `-y`, `--dry-run`, `--json`, as `purge image` has them.
  - Lists the sessions it would delete, with verdict, age and prompt, and asks first.

1. Remote selection reads the remote's refs (`git ls-remote`), so sessions never pulled locally can be purged too.
2. `--verdict` needs the records, so with `--from remote` it fetches them first.
3. Safe for test cases made from a capture: tj-create-from-capture tags the snapshot commit, and the tag keeps it.
4. Doesn't touch `.thunderjar/quickCaptures/`.
5. Deletes refs only: no `git gc`.

## Example CLI Output

```sh
$ thunderjar purge capture --verdict incomplete --dry-run
6baafa46-f9af-5807-ac98-934c8715e118  incomplete  12d  "Add a --json flag to show"
1 session would be deleted.
```

## Tests

- Real-file tests on a temporary git repository with captures in both stores, and a bare repository as the remote.

## Human interventions

None.
