---
name: github-general
description: General conventions for working with GitHub (issues, pull requests, comments). Use when interacting with GitHub.
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
Supervising engineer: dwjohnston

Humans: add your notes here

-->

## Acknowledge the project owner's comments with 👀 emoji

👆

When the task is done convert the emoji to 🚀. 

If you require human input add the 😕 emoji (`confused`). GitHub's reaction set is fixed: 👍 👎 😄 🎉 😕 ❤️ 🚀 👀, so there is no ☹️.

If your tools can add reactions but not remove them, leave the 👀 in place and add 🚀 next to it.

## Always include AI content headers.

Generate the header with [scripts/ai-header.ts](scripts/ai-header.ts) and put it at the top of everything you post to GitHub: comments, issues, PR descriptions.

```bash
bun skills/github-general/scripts/ai-header.ts --harness "<harness>" --model "<model>"
```

It has two modes, picked automatically from `CLAUDE_CODE_REMOTE`. Use `--mode` to force one.

| Mode | Output |
|---|---|
| `local` | `🤖 <harness>/<model>/<session id>` |
| `cloud` | `🤖 <harness>/<model>/[<session id>](https://claude.ai/code/<session id>)` |

The session ID comes from the environment. Pass `--session` to override it.

If your harness forbids model identifiers somewhere (e.g. commit messages or PR descriptions), pass `--no-model` instead of `--model` there. The header becomes `🤖 <harness>/<session id>`. Keep the model everywhere else.



## Put all content inside expand blocks. 

Github supports some HTML, notably the `<details>` and `<summary>` tags. 

Put large content blocks into such tags. 


```html
<!-- ai header -->

<details>
<summary><!-- Short description of content --></summary>

<!-- content here -->

</details>
```

`<details>` is the outer tag and `<summary>` is the always-visible line. Leave a blank line after `<summary>` and before `</details>` so Markdown inside renders.

**Rationale:** Large blocks of AI content are exhausting to see. 

Multiple blocks can be used. 

eg. 
```
<what the problem was>
<how we solved it>
<tests> 
```


## !!AGENT  is instructions for you 

If you are live monitoring codebases - text content in markdown files `!!AGENT` is instructions for you. 

Replace the block with whatever was required in the instruction. 

eg. 
`````
``` !!AGENT
Demonstrate how to reverse and array here.

nb. This is particularly block is just an example, don't actually replace this section 
```
`````

eg. 

```
[Array.from](!!AGENT add link to MDN documentation) 
```

We would expect the AGENT to make this diff

```diff
-[Array.from](!!AGENT add link to MDN documentation) 
+[Array.from](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from)
```

### !!AGENT:DENOTE

Is instructions means the inserted section should be be wrapped with AI indicators. 

eg. 
`````
```!!AGENT:DENOTE
Demonstrate how to reverse array here 
```
`````

Becomes 

`````
🤖
```js
const reversedArray = arr.toReversed(); 
```
⁄🤖

`````

