# Launch Plan

What needs to be done between now and launch, in order. Not how — each phase gets its
own detail when we reach it.

**Launch** means a public open-source beta: a pre-release version that someone outside
the project can find on the website, install from npm, and run an experiment with.

**Deploy to production first, not last.** The npm package and the website go live
before there is any real functionality, and every change after that ships through the
real release path.

## 1. Spec ideation, then refinement

- Spec ideation. 👈 we are here
- Outstanding questions answered.
- Spec parsing.
  - Does everything make sense?
  - Is terminology documented? Are aliases documented?
  - Is terminology used consistently?
- Fact checking.
  - Particularly, for example, the claims of the token shape in 087 need to be verified.
- Verification.
  - Link to canonical documentation where we can find it.
  - A bash script that does a simple execution of a coding harness and captures its
    output to a .txt file. Both files committed.

## 2. Empty pages filled or deferred

Every stub page is either specced or its subject is recorded as a non-goal in
[020-goals-non-goals.md](020-goals-non-goals.md). Implementation can't build from `_TBD_`.

## 3. Deploy to production

- npm package published, with a release pipeline.
- Website live, deployed on every release.

## 4. Ralph loop preparation

Implementation runs as a ralph loop. Before it starts:

- The task list to give the loop.

## 5. Project scaffolding

- Basic tooling: TypeScript, linting, file-structure linting. See
  [140-tooling.md](140-tooling.md).
- A robust testing strategy from day one: the layers in
  [120-test-boundaries.md](120-test-boundaries.md) in place.
- CI for Thunderjar itself.

## 6. Implementation

Vertical slices, each shipped as a release. The first is a walking skeleton: the thinnest
end-to-end path through Thunderjar — build a prerun image, run a fake harness, commit the
postrun image, record the run — doing almost nothing useful.

## 7. Dogfooding

Run Thunderjar on real projects, and check it answers the questions in
[010-motivation.md](010-motivation.md).

## 8. Launch

Public beta announced.
