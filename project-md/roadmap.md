
Suggested tasks are labelled:

- Priority: ‼️ sooner, 👐 middling, 😴 nice to have
- Effort: 🍳 fits what's there, 🪖 needs thought

## Documentation

- helper functions
- 'how ready is this'
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models

- ‼️🍳 README at the repo root
    - There's none, so the npm and GitHub pages are blank
- ‼️🍳 Getting started, past `init`
    - Prerequisites: Docker, Bun, an API key
    - First run, reading the results
- ‼️🍳 Installing the tj skills
    - The Todo in getting started
- 👐🍳 Each harness: its API key, and what its model IDs look like
- 👐🍳 Measurements: instruments, metrics, stats, stale measures
- 👐🍳 Remote runs: image store, Postgres, runtime, runner
    - `runtime` isn't in the declaration reference
- 👐🍳 One real experiment, written up end to end
    - eg. one from https://github.com/dwjohnston/thunderjar/issues/103
- 😴🍳 Troubleshooting: the log files, agents that didn't end cleanly
- 😴🍳 Review the pages still marked as AI placeholders



## Tooling

- 👐🍳 Land or close the open PRs
    - 150: record an execution as it starts
    - 165: view screens
    - 180: small costs
    - 181: skills sync
    - 189: fly create and destroy
- 😴🍳 Real agent tests on a schedule
    - Pinned harness versions and model IDs stop working, and nothing notices
- 😴🍳 Delete or archive `project-md/prd`
    - It has drifted, eg. harness and model are still two parameters there

## Functionality - Skills, Hooks

- ‼️🍳 `init` installs the tj skills, for all four harnesses
- 👐🍳 Skill: quick capture -> test case
    - https://github.com/dwjohnston/thunderjar/issues/167
- 👐🍳 Skill: read an execution, say what differed
    - From `show --json`
- 👐🍳 Prompt set helper: a skill, put where each harness looks for it
- 👐🪖 Hooks in a prompt set, per harness
- 😴🪖 Skills that refer to other skills -> a hard composition
    - See things-that-are-a-bit-messy


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

- ‼️🪖 Session transcript, per harness
    - Where each harness leaves its session log, read into one shape
    - Skill invoked, tool call and conversation contains all need it
- 👐🍳 Files changed
    - Diff against the code state
    - eg. 'test file untouched', 'only touched src'
- 👐🪖 LLM judge
    - For what a regex can't check, eg. 'did the reply follow the format'
- 😴🍳 Token cost and duration as metrics
    - So they get a stat and a better direction, like any other
- 😴🍳 More stats: p90, standard deviation
- 😴🍳 Test file instrument for other runners
    - eg. vitest, pytest
- 😴🪖 Categorical metrics
    - See measurements philosophy






## Functionality - Helper functions

- codeStateAtTagOrBranch
- codeStateAtCommit
- promptSetAtTagOrBranch
- promptSetAtCommit

- ‼️🍳 `codex`, `copilot`, `opencode` harness helpers, like `claudeCode`
    - `init`'s starters for them can't read the reply or the token costs
    - Working ones, on OpenRouter, are in this repo's own `.thunderjar`
- 👐🍳 codeStateFromPatch
    - Uncommitted changes as a code state. Not supported today
- 😴🍳 Install step on the code state helpers
    - eg. `bun i`
- 😴🍳 Task `dependsOn` code states
    - Reject a test case that pairs it with any other
- 😴🍳 A task's measurements declared as an array

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

- ‼️🍳 `remeasure`
    - `show` already says when a measure is stale. Nothing can fix it
- ‼️🪖 `compare` - two executions side by side
    - How it works promises this
- ‼️🍳 Retry pushes. A failed postrun push fails only its iteration
    - https://github.com/dwjohnston/thunderjar/issues/162
- ‼️🍳 A runtime command that prompts hangs the run forever
    - https://github.com/dwjohnston/thunderjar/issues/143
- 👐🍳 Push failure message always blames the login
    - https://github.com/dwjohnston/thunderjar/issues/161
- 👐🍳 `run --resume <execution>` - only the iterations that failed
- 👐🍳 `doctor <test case>`
    - Docker is running, the keys its harnesses need are set
- 👐🍳 Spend limit: stop starting iterations past a cost
- 😴🍳 `show --markdown`, to paste results into a PR
- 😴🍳 `restore` - or drop it from the plan, `checkout` may cover it
- 😴🍳 `tj` as a bin alias





## Functionality - Browser view

- 👐🍳 Task -> execution -> run screens
    - https://github.com/dwjohnston/thunderjar/pull/165
- 👐🍳 Run page: what the agent changed, as a diff
- 👐🍳 Run page: the agent's transcript
- 😴🍳 Compare two executions
- 😴🍳 Follow a running execution live
- 😴🍳 Export as a static page, to share results

## Functionality - general

- graceful run abort
    - if a run is aborted with ctrl+c it should still save whatever images it already had

- https://github.com/dwjohnston/thunderjar/issues/112

- 👐🪖 API failures aren't agent failures
    - Rate limit, out of credits
    - Retry, or leave the run out of the metrics
- 👐🪖 Multi-turn initial prompts
    - Specced in task 2000. The types still mention turns
- 😴🪖 Start mid-conversation
    - Session history in the image, then `--resume`
- 😴🪖 Claude GitHub integration as a harness
    - https://github.com/dwjohnston/thunderjar/issues/12
- 😴🪖 MCP as a fake server, to assert on what was called




## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch. 

- 👐🪖 Smaller postruns: keep the workspace diff, not a whole image
    - Would ease the pushing too
- 😴🍳 Fly runtime scripts as a documented starter
    - Today they're only in this repo's `.thunderjar`





