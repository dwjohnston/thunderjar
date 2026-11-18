

## Suggested tasks

Lines with these labels are suggestions, not yet agreed.

- Priority: ‼️ sooner, 👐 middling, 😴 nice to have
- Effort: 🍳 easy, 🪖 hard

## Documentation

- helper functions
- 'how ready is this'
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models
    - 👐 🍳 turning a captured session into a test case
    - 👐 🍳 remote runs
        - runtime, runner, image store
    - 😴 🍳 writing a harness for an agent with no helper
- 👐 🍳 Troubleshooting
    - docker login, missing API keys, an agent that timed out
- 😴 🍳 The `--json` output of each command



## Tooling

- 👐 🍳 CI recipe
    - A sample workflow: run a test case when a PR touches prompt files, comment the results
- 😴 🍳 Shell completions

## Functionality - Skills, Hooks

- 👐 🍳 Skill: interpret results
    - Reads `show --json`, says which permutation won and how sure it is
- 👐 🍳 Skill: diagnose a failed run
    - Reads the log, the agent's end and the postrun image
- 😴 🍳 Skill: promote a quick capture to a test case


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

- ‼️ 🪖 Save the agent's session log with each run
    - Skill invoked, tool call and conversation contains all need it
    - Per harness: where the log is, and how to read it

- ‼️ 🪖 LLM judge
    - A rubric, applied to the diff or the reply
    - Needs a model and key at measuring time

- 👐 🍳 Diff
    - Files changed, lines added and removed
    - e.g. 'only touched these files', 'didn't edit the test'

- 👐 🍳 Run facts as metrics
    - Duration, cost, tokens, whether it timed out
    - So they aggregate and compare like any other metric

- 👐 🪖 Categorical metrics
    - As the measurements philosophy mentions
    - e.g. errors by TS error code

- 😴 🍳 Presets over `shell`
    - Typecheck error count, lint error count, test pass/fail for runners other than bun






## Functionality - Helper functions

- codeStateAtTagOrBranch
- codeStateAtCommit
- promptSetAtTagOrBranch
- promptSetAtCommit

- ‼️ 🍳 `codex()`, `copilot()`, `opencode()`
    - As `claudeCode()` is: install, run script, reply reader, token cost reader
    - Today each project copies its own
- 👐 🍳 codeStateFromCapture
    - A captured session's starting code
- 👐 🍳 promptSetFromFolder
    - A local folder of prompt files, no git ref needed
- 😴 🍳 skillOnly
    - A prompt set that adds or swaps one skill, leaves the rest

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

- ‼️ 🪖 `compare`
    - Planned, not built
- ‼️ 🪖 `remeasure`
    - Planned, not built
    - Without it, a new measurement means paying for the runs again
- 👐 🪖 `restore`
    - Planned, not built

- 👐 🍳 `run --only`
    - Run some of a test case's permutations
- 👐 🍳 `run --retry <execution>`
    - Re-run only the container runs that failed
- 👐 🍳 `plan`: estimated cost
    - From what past executions of the test case cost
- 👐 🍳 `doctor`: more checks
    - Docker is running, the API keys a test case's harnesses need are set
- 👐 🍳 `show --diff`
    - What a container run changed
- 👐 🍳 `show --format md`
    - A table to paste into a PR
- 😴 🍳 `executions`: filters
    - Status, since, limit





## Functionality - Browser view

- 👐 🍳 Two executions side by side
- 👐 🪖 Container run page
    - Its diff, reply and session log
- 😴 🍳 A metric over time
    - One test case, across its executions
- 😴 🍳 Static export
    - One HTML file to share

## Functionality - general

- graceful run abort
    - if a run is aborted with ctrl+c it should still save whatever images it already had

- https://github.com/dwjohnston/thunderjar/issues/112

- ‼️ 🪖 Multi-turn tasks
    - Docs list it as not supported yet

- 👐 🪖 Spending cap
    - Stop an execution once it has cost $X

- 👐 🪖 Tell infrastructure failures from agent failures
    - Rate limits, overloaded models, a pull that failed
    - Retry them, and keep them out of the aggregates

- 👐 🍳 Tasks name the code states they work with
    - From the dogfooding notes: `dependsOn`
    - Reject a test case that pairs a task with another code state

- 👐 🪖 Code states from uncommitted changes
    - See 'things that are a bit messy'

- 👐 🪖 Network policy for containers
    - Model API only, so a run can't depend on the internet

- 😴 🪖 'Is this difference real?'
    - Confidence intervals, or how many iterations you'd need

- 😴 🪖 MCP as a measurable fake
    - e.g. 'it called create PR with this payload'




## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch. 

- 👐 🪖 Resume an execution
    - Keep the container runs that finished, run the rest

- 👐 🍳 Runtime recipes
    - Beyond Fly: an SSH host, a cloud VM

- 😴 🍳 `--timings` in the run data store
    - To see what the bottleneck is across executions





