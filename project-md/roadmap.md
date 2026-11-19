

## Documentation

- helper functions
- 'how ready is this'
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models

- ‼️🍳 Local-only quick start: no Fly, no image store, no Postgres
- ‼️🍳 Which API key each harness needs, and where it goes
- 👐🍳 Troubleshooting: reading `.thunderjar/logs`, a run that failed or timed out
- 👐🍳 Worked examples: the gauntlet test cases, end to end
- 😴🍳 Costs: what a typical execution spends


## Tooling

- 👐🍳 `doctor <test case>`: check only the keys and images that test case needs
- 😴🍳 Prune `project-md/prd` and `delivery/tasks` to what's still true


## Functionality - Skills, Hooks

- 👐🍳 Promptset helper that installs a skill for all four harnesses (`.claude/skills`, `.agents/skills` etc.)
- 😴🪖 Hooks in a promptset, per harness
- 😴🪖 Skills that refer to other skills: a hard composition, not "refer to <skill>"


## Functionality - Measurement instruments

- Skill invoked
    - Detects if a skill was invoked
    - Needs to have per harness configuration 
- Tool call 
    - As above 

- Conversation contains 
    - Investigate the agents session logs for certain text. 

- commits
    - helper function that lists all the commits and allows easy assessment of them
        - For example of a red green tdd check, you could use this instrume to check that commit 1 had 🔴 and only touched the test and commit 2 had 🟢 and only touched the file

- 👐🍳 Files changed: which paths the run touched, e.g. "only touched `src/`"
- 👐🍳 Typecheck / lint passes, error count
- 👐🍳 Test suite passes (generic, not just one bun test file)
- 😴🍳 Duration and token cost as metrics, so they can be compared like any other
- 😴🪖 LLM-as-judge instrument
- 😴🪖 Categorical metrics (see measurements philosophy)


## Functionality - Helper functions

- codeStateAtTagOrBranch
- codeStateAtCommit
- promptSetAtTagOrBranch
- promptSetAtCommit

- ‼️🍳 Ship `codex`, `copilot`, `opencode` helpers like `claudeCode`: reply and token cost parsing currently lives in project files
- 👐🍳 codeStateFromPatch: uncommitted changes as a code state
- 👐🍳 promptSetFromFolder: copy a folder of md files over the code state
- 😴🍳 Declare a task's measurements as an array, less verbose
- 😴🍳 Task `dependsOn` code states: reject test cases pairing it with any other

### Prompt Set Application 

- ie. see the philosophy compose md
    - https://github.com/dwjohnston/compose-md
    - This _could_ but I really don't want to be maintaining it.



## Functionality - CLI 

- `checkout` - For a given run, get the saved post run image and run it, SSH inside
    - Useful for investigating


- Remove `--local` just use the solution of an env var with multiple configurations. 

- Purging: 
    - prerun, postrun images from local, container store
    - capture refs from local, remote

- arbitrary test case runs 
    - eg. something like `thunderjar run the-test-case --harness-model="claude-code/haiku,opencode/haiku"

- ‼️🪖 `compare` - two executions, same measurements side by side (planned, not built)
- 👐🍳 `remeasure` - apply current measurements to past postrun images (planned, not built)
- 👐🍳 `restore` - a run's end state as a local branch (planned, not built)
- ‼️🍳 Retry an iteration on transient API errors (rate limit, overloaded)
- 👐🍳 `run --resume <execution>` - rerun only the failed iterations
- 😴🍳 Delete executions from the run data store
- 😴🍳 `executions --limit`, filter by status


## Functionality - Browser view

- 👐🍳 A run's agent transcript
- 👐🍳 A run's code diff, from code state to postrun
- 😴🍳 Chart of a metric across permutations

## Functionality - general

- graceful run abort
    - if a run is aborted with ctrl+c it should still save whatever images it already had

- https://github.com/dwjohnston/thunderjar/issues/112




## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch.

- 👐🪖 Spend cap: stop an execution past a token cost limit

