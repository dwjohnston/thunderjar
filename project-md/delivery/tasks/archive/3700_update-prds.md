# 3700: Update the PRDs

The PRDs describe what 3100 to 3600 built: hashing what parameters output, `resolve`, `files/`, harness folders that pin a version, code states that clone, and build secrets.

## Version bump type

none

## Artifacts

- 060: hashing rewritten as output text + `files/`, the permutation hash and the image hash, `resolve` in place of `determineHash` / `additionalHash`, the fold with no Thunderjar checkout, and build secrets
- 004: applied. Harness folders pin a version, pairs are `<harness>/<model ID>`, and its hashing matches 060
- 064: the harness without `versions.ts` / `models.ts`, with `version`, `collectTokenCosts` beside `collectReply`, and `claudeCode()`
- 051: `.thunderjar/parameters/`, the `files/` folder, and version-pinned harness folders
- 062: code states clone a repository at a pinned commit in their own `RUN`, follow a branch with `resolve`, and clone a private one with a build secret
- 063: prompt sets copy their `files/`, rather than reading files at a commit
- 030, 055, 081 and 085: the hash terms, the generated pair type, the image hash in prerun tags, and `resolved` on each run record

## Tests

None: documentation only.

## Human interventions

None.
