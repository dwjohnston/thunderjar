

## Documentation

- ‼️🍳 README at the repo root
    - There's none, so the npm and GitHub pages are blank

- ‼️🍳 Getting started, past `init`
    - Prerequisites: Docker, Bun, an API key
    - First run, reading the results

- ‼️🍳 Installing the tj skills
    - The Todo in getting started

    

- helper functions
- 'how ready is this'
- remote runs
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models

    - ‼️ 🍳 writing measurements
        - instrument -> metrics -> stat

- Security disclosure
- 



## Tooling
- 👐 🍳 Real agent tests for Codex, Copilot, OpenCode
## Functionality - Skills, Hooks

- rework quick-capture to use the same capture mechanism as tj-oneshot 
- 😴 🍳 `tj-interpret-results`
    - Reads `show --json`, says which permutation won and what to try next
- 😴 🍳 `tj-iterate`
    - Loop: tweak a promptset, run, compare, repeat
- 👐 🍳 `tj-remote-setup`
    - Walks through image store, run data store, runtime


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






## Functionality - Helper functions

- codeStateAtTagOrBranch
- codeStateAtCommit
- promptSetAtTagOrBranch
- promptSetAtCommit

 ‼️🍳 Ship `codex`, `copilot`, `opencode` helpers like `claudeCode`: reply and token cost parsing currently lives in project files

## Functionality - Parameter configuration 

- 😴🍳 Task `dependsOn` code states: reject test cases pairing it with any other



### Prompt Set Application 

- ie. see the philosophy compose md
    - https://github.com/dwjohnston/compose-md
    - This _could_ but I really don't want to be maintaining it. 


## Functionality - CLI 

- `checkout` - For a given run, get the saved post run image and run it, SSH inside
    - Useful for investigating

- `run`
    - 😴 🍳 `--max-cost`: stop starting iterations once spent
    - 😴 🍳 Rerun only the failed iterations of an execution
    - ‼️ 🍳 Show image build status in the table
        - https://github.com/dwjohnston/thunderjar/issues/157

- Purging: 
    - prerun, postrun images from local, container store
    - capture refs from local, remote

- arbitrary test case runs 
    - eg. something like `thunderjar run the-test-case --harness-model="claude-code/haiku,opencode/haiku"

- 👐🍳 `remeasure` - apply current measurements to past postrun images (planned, not built)
- 👐🍳 `restore` - a run's end state as a local branch (planned, not built) (better name that 'restore' though?)
- 


## Functionality - Browser view

- run agents transcript
- agents code diff
- run agents final output 




## Functionality - general

- graceful run abort
    - if a run is aborted with ctrl+c it should still save whatever images it already had

- https://github.com/dwjohnston/thunderjar/issues/112


- 😴 🪖 Spend cap: stop an execution past a token cost limit

- 😴 🪖 MCP calls
    - A fake MCP server that records what was called with what

👐 🪖 Network policy for run containers

## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch. 



