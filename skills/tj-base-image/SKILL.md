---
name: tj-base-image
description: Add a Thunderjar base image, i.e. the FROM line and system tools every experiment's image starts with. Use when a code state or measurement needs a toolchain or service the existing base image lacks, e.g. "use Python 3.13", "add Go to the image", "it needs a database".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Add a base image

A base image is the first fragment of every experiment's image, in `.thunderjar/parameters/baseImages/<name>/index.ts`. Its `applyParameter` must start with `FROM`, pin the image's version, and install the system tools the later fragments need: bun for `bunTestFile`, and a git identity so the agent and prompt sets can commit. 

You might add things like a database or other tools to a base image.


```ts
import { declareBaseImage } from "thunderjar";

export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \\
  && git config --system user.email agent@thunderjar.invalid`,
});
```
