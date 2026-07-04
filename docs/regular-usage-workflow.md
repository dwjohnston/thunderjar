# Regular Usage Workflow

How everyday BAU work turns into Thunderjar tasks.

## The three scenarios

**Scenario 1 — clean one-shot.** You give the agent a task ("there's an X bug, can you solve it?") and it nails it. You say "looks great, thanks." Good candidate.

**Scenario 2 — one-shot with a correction.** Same as above, but you had to say "you missed Y" once, the agent fixed it, and then you were satisfied. Still a good candidate — the task was one-shot-*able*, the current model/prompt combo just fell short of it. That gap is exactly what's worth capturing.

Within Scenario 2, "you missed Y" splits into two kinds, and they get fixed differently:

- **Convention gap** — e.g. "you didn't write a test." Not something a real bug report should have needed to say; the fix belongs in a Prompt Set (CLAUDE.md / skills), not the task instruction. The task instruction is left untouched; you iterate on Prompt Sets to see which one gets the agent to do it unprompted.
- **Specification gap** — e.g. "there's other buggy/edge-case behavior you missed." The original instruction was an incomplete bug report — no amount of prompt tuning teaches an agent to guess an edge case nobody mentioned. Fix this by rewriting the task instruction to include the missing detail, as a real complete bug report would. Once corrected, treat it like Scenario 1 — there's nothing left to iterate on.

**Scenario 3 — needs ongoing steering.** The task requires iterative back-and-forth, judgment calls the instruction couldn't have anticipated, multiple rounds of direction. This never ends in a clean "looks great" — it just resolves through negotiation. **Not a Thunderjar candidate.** Don't try to write measurements for it and don't try to prompt-tune your way out of it; the task itself is the wrong shape for one-shot benchmarking.

## Mechanics of creating measurements (Scenarios 1 and 2)

1. Work happens on ordinary commits, not a Thunderjar worktree. `A` = the pre-feature commit, `B/C/D` = the feature work (may take several commits to land, including any Scenario 2 correction).
2. Once satisfied, mine measurements from the `A..D` diff: what files should exist, what should NOT be present (e.g. `as any`), and — most importantly — a `correctness-test` template capturing the actual contract (independent of whether the agent's own tests are any good). Commit this as `E`.
3. Create a new branch off `A` and cherry-pick `E` onto it. That tip commit — `A`'s codebase plus `E`'s measurements, but never `B/C/D`'s actual solution — becomes the Task's permanent `commitHash`. A worktree checked out here has the measurements already present but has to solve the problem from scratch.
4. For Scenario 2's specification gaps: rewrite the task instruction before banking it (see above) rather than keeping the original incomplete prompt around.
5. For Scenario 2's convention gaps: no instruction change. Instead, iterate on Prompt Sets — improve the CLAUDE.md/skills content (ordinary commits on `main`, e.g. commit `F`), then re-run the experiment against the same pinned `commitHash` with the new Prompt Set to see if it closes the gap. Prompt Sets are applied via `git checkout <ref> -- <pathspec>` inside the worktree, which reaches the shared object database regardless of which commit the worktree itself is pinned to — so `F`, `G`, `H`... keep landing on ordinary `main` and get picked up without ever re-pinning the task.

## Two mechanisms still needed

**Detecting Scenario 1/2 (a skill or a hook).** Something needs to notice "this session just ended in success, is this a good Thunderjar candidate?" and prompt the user to walk through turning it into a task. Whether this is a hook that watches every turn and proactively nudges, or a skill the user invokes themselves in the moment, is not yet decided.

**Creating the measurements (a skill).** Something needs to help turn a known-good `A..D` diff into the actual measurement set — proposing `fileCreated`/`grep`/`command` assertions and, most valuably, drafting the `correctness-test` template — for the human to review before it's committed as `E`.
