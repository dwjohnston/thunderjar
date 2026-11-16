<!--
🤖
This file was created with AI

Harness: DeepSeek Harness
Model: deepseek-flash
Session Id: session-e205e95a-0f84-43fd-9a95-7f723be62b1b
Supervising engineer: blacksheep-bot

Humans: add your notes here
-->

# What it's not suitable for


## Fundamentally not supported 

- Any agent that interacts with the wider internet generally 
    - "Do some deep research"
        - The internet will have changed by the time you rerun the experiment. 
    - "Fix issue #42 on github"
        - This issue will likely have changed state by the time you run the experiment. 

## Just not supported yet 

- Multi turn tasks 


## Things it could probably work for, but I haven't specifically tested


- Tasks that take place after several turns in a conversation
    - You would need the conversation history to exist on the Docker image. 
    - Then it's just a matter of passing a `--resume <session id>`



