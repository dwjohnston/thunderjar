---
harness: claude-code
model: sonnet
effort: low
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
Supervising engineer: David Johnston

Humans: add your notes here
-->

# 3900: `capture push --session`

Push one session's capture instead of all of them. The ralph loop (`project-md/delivery/ralph.ts`) needs this to push only the session it just ran.

A small, self-contained task: also the example task for trying the ralph loop.

## Version bump type

minor

## Artifacts

Adds `--session <id>` to `capture push`.

- Finds the session's store with `startedIn()` in `src/capture/store.ts`.
- Pushes only that session's refspec:
  - branch store: `refs/heads/thunderjar/capture/<id>`
  - refs store: `refs/thunderjar/capture/<id>/*`
- Fails with a message, and a non-zero exit code, for a session with no capture.
- Without `--session`, `capture push` is unchanged.

## Example CLI Output

```sh
$ thunderjar capture push --session 6baafa46-f9af-5807-ac98-934c8715e118 --dry-run
git push --no-verify origin refs/heads/thunderjar/capture/6baafa46-f9af-5807-ac98-934c8715e118:refs/heads/thunderjar/capture/6baafa46-f9af-5807-ac98-934c8715e118

$ thunderjar capture push --session nope
No capture of session nope. `thunderjar capture list` shows the captures.
```

## Tests

- Unit tests of the push arguments in `src/capture/`.
- A `--dry-run` test in `src/cli/commands/capture/capture.test.ts`.

## Human interventions

None.
