## Legend

Labels on suggested items:

- Priority: ‼️ sooner, 👐 middling, 😴 nice to have
- Effort: 🍳 easy, fits the existing framework. 🪖 hard, needs a human to think.


## Documentation

- helper functions
- 'how ready is this'
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models
    - ‼️ 🍳 writing measurements
        - instrument -> metrics -> stat
    - 👐 🍳 remote runs
        - runtime, runner, `attach`
    - 😴 🍳 running thunderjar in CI
- ‼️ 🍳 Multi turn
    - It's built, but 'what it's not suitable for' says it isn't
- 👐 🍳 What a run costs
    - Rough dollars and minutes for the starter test cases
- 😴 🍳 Troubleshooting
    - Where the logs are, what `doctor` checks



## Tooling

- 👐 🍳 Real agent tests for Codex, Copilot, OpenCode
    - Only Claude Code has a cheap on-demand one
- 😴 🍳 Scheduled run of the starter test cases against the latest harness versions
    - Catches a harness release breaking the starter harnesses
- 😴 🍳 Script that bumps the pinned harness versions

## Functionality - Skills, Hooks

- ‼️ 🍳 Quick capture -> test case
    - https://github.com/dwjohnston/thunderjar/issues/167
    - A skill that triages `quickCaptures` and sets one up
- 👐 🍳 `tj-interpret-results`
    - Reads `show --json`, says which permutation won and what to try next
- 👐 🍳 `tj-iterate`
    - Loop: tweak a promptset, run, compare, repeat
- 😴 🍳 `tj-remote-setup`
    - Walks through image store, run data store, runtime


## Functionality - Measurement instruments

- Skill invoked
    - Detects if a skill was invoked
    - Needs to have per harness configuration 
- Tool call 
    - As above 

- Conversation contains 
    - Investigate the agents session logs for certain text. 

- 👐 🍳 Diff
    - Files touched, lines changed
    - eg. 'only touched files matching this glob'
- 👐 🍳 Test command
    - `bunTestFile` but for any runner: jest, vitest, pytest
- 👐 🍳 Agent facts
    - Duration, turns, tool call count, as metrics like any other
- 😴 🍳 File unchanged / file absent
- 😴 🍳 Typecheck / lint error count
    - Presets over `shell`
- 👐 🪖 LLM judge
    - A model scores the end state against a rubric
    - Not repeatable, costs money. Does it fit the philosophy?
- 👐 🪖 Categorical metrics
    - The 'future state' in the measurements philosophy
- 😴 🪖 MCP calls
    - A fake MCP server that records what was called with what

- commits
    - helper function that lists all the commits and allows easy assessment of them
        - For example of a red green tdd check, you could use this instrume to check that commit 1 had 🔴 and only touched the test and commit 2 had 🟢 and only touched the file






## Functionality - Helper functions

- codeStateAtTagOrBranch
- codeStateAtCommit
- promptSetAtTagOrBranch
- promptSetAtCommit
- 👐 🍳 codeStateFromPatch
    - For uncommitted changes, currently 'not supported' in tj-codestate
- 👐 🍳 installDependencies
    - bun, npm, pnpm. Every code state hand writes this
- 👐 🍳 codex, copilot, opencode
    - Like `claudeCode`. Today they're only copied in by `init`
- 👐 🍳 skill
    - Writes a skill to wherever each harness reads skills from
- 😴 🍳 Measurement presets
    - Declare several measurements at once. See dogfooding notes
- 👐 🪖 Task `dependsOn` code states
    - Reject a test case that pairs a task with a code state it makes no sense on

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
    - Planned, not built. Two executions side by side
- ‼️ 🪖 `remeasure`
    - Planned, not built. A new measurement currently needs a whole new run
- 😴 🍳 `restore`
    - Planned, not built. Overlaps with `checkout`, maybe drop it

- `show`
    - 👐 🍳 `--diff`: what the agent changed in a container run
    - 👐 🍳 `--transcript`: the agent's session log
    - 😴 🍳 `--markdown`: a table to paste into a PR

- `run`
    - 👐 🍳 `--max-cost`: stop starting iterations once spent
    - 👐 🍳 Rerun only the failed iterations of an execution
    - ‼️ 🍳 Show image build status in the table
        - https://github.com/dwjohnston/thunderjar/issues/157

- 👐 🍳 `plan`: estimated cost and duration, from past executions
- 👐 🍳 `doctor`: check the API keys of the harnesses in use, Docker running, disk space
- 😴 🍳 `executions`: filter by status and date, delete one





## Functionality - Browser view

- 👐 🍳 Container run page
    - Diff, transcript, replies
- 👐 🍳 Compare two executions
    - Needs `compare`
- 👐 🍳 Live refresh while an execution is running
- 😴 🍳 Trend chart
    - One metric of one test case, across executions
- 😴 🪖 Static export
    - A results page you can host or attach to a PR

## Functionality - general

- graceful run abort
    - if a run is aborted with ctrl+c it should still save whatever images it already had

- https://github.com/dwjohnston/thunderjar/issues/112

- ‼️ 🪖 Is the difference real?
    - Confidence interval or significance on A vs B
    - 'you need about n more iterations'
- ‼️ 🪖 Infra failure vs agent failure
    - A 429 or 529 from the provider is not the agent doing badly
    - Mark those runs, leave them out of the stats, retry them
- ‼️ 🍳 Runtime commands hang on a prompt
    - https://github.com/dwjohnston/thunderjar/issues/143
- 👐 🪖 Network policy for run containers
    - Block or allowlist the internet, so runs repeat
- 👐 🍳 Audit: do postrun images or session logs hold API keys?
    - They get pushed to a registry
- 😴 🍳 Record the model the provider actually served
    - Warn when a model ID is an alias that will move
- 😴 🪖 Start from the middle of a session
    - https://github.com/dwjohnston/thunderjar/issues/77
- 😴 🪖 Claude GitHub integration
    - https://github.com/dwjohnston/thunderjar/issues/12




## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch. 

- ‼️ 🍳 Retry pushes, one failed postrun push shouldn't fail the execution
    - https://github.com/dwjohnston/thunderjar/issues/162
- ‼️ 🍳 Push failure message blames the login whatever the error
    - https://github.com/dwjohnston/thunderjar/issues/161
- 👐 🪖 Choose which postrun images get pushed
    - eg. only failed runs, or none, pull on demand from the runtime
- 👐 🪖 Provider rate limits
    - Back off across all containers, not each on its own
- 👐 🍳 Runtime recipe for a plain SSH Docker host
    - Fly is the only worked example
- 😴 🍳 GitHub Action
    - Runs a test case when a PR touches prompts, comments the results





