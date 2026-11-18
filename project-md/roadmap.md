

## Documentation

- helper functions
- 'how ready is this'
- Thunderjar capture  
- Guide
    - tweaking skill descriptions
    - comparing models



## Tooling

## Functionality - Skills, Hooks


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





## Functionality - Browser view

## Functionality - Remote runs 

- General optimisation - often the _pushing_ becomes a bottle neck. 

- I think what you want is something that turns:   
    - The permutation list -> a manifest that determines when things will be run -> it acts on it. 
    - eg. you want to schedule it so that not all the post run images are pushing at the same time 


- Abiltity to use subscriptions to do run s

- 'batch runs' - Being able to schedule running _multiple_ test cases in one big batch. 





