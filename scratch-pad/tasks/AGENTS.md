# Working on tasks

## General

- Follow all instructions you encounter as normal.
- See [PLAN.md](../PLAN.md) for for the broader context of what you are working on. 

## TDD loop

Work in a TDD loop:

1. Write the appropriate (failing) test and commit it.
2. Implement the functionality so the test passes, and commit it.

It may take several attempts to get both the test and the implementation right. Rebase to keep the commit history clean: there should be only one pair of commits per sensible unit of work.

## Finishing a task

- Make sure all work is committed before you move the task into done.
- Your final commit moves the task into done.
- Add an annotated tag to this final commit.

### Tag annotation format

```
🤖- <task name>

Task Description:
<task description>

Decisions made:
<decisions made>

Feedback or suggestions for improvement:
<feedback>


<model>/<harness>
```
