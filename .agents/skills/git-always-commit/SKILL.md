---
name: git-always-commit
description: Always commit any changes. Invoke when editing files. 
---

# Always commit

<!-- This skill should be converted to hooks -->

## At at the start of a session

Once per repository you are working on, add an empty commit


```text
🤖 <agent name>: Session Start: <session id>

<harness>/<model>
```

## Subequent changes

Before you end the turn, be sure to commit
```text
🤖 <agent name>: <description>

Session ID: <session id>
<harness>/<model>
```

You may also have additional instructions relating to commit message formatting - also incorporate those instructions into the message. 

## If you discover changes unrelated to your work

Leave the changes uncommited. At the end of the the turn /user-get-attention informing them of the uncommited changes. 

## If the user tells you to commit unrelated changes. 

Commit the changes in logically cohesive units at appropriate granularity. 

Use the following format in the commit message: 

```
🤖 🪎 <agent name>: <description>

Session ID: <session id>
<harness>/<model>
```