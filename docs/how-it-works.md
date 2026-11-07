<!--
🤖
This file was created with AI

Harness: DeepSeek Harness
Model: deepseek-flash
Session Id: session-e205e95a-0f84-43fd-9a95-7f723be62b1b
Supervising engineer: blacksheep-bot

Humans: add your notes here
-->

# How it works

We have an experiment 


```ts
import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["commit-a1b2c3"],
  promptSet: ["commit-aaabbb", "commit-bbbccc"],
  harnessModel: [
    "claude-code-2.1.311/claude-opus-5-5",
    "claude-code-2.1.311/claude-haiku-5-5",
  ],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 5,
});
```

When we run the experiment 

```bash
thunderjar run is-prime-baseline
```

The five arrays cross to make four permutations (`1/1/2/2/1`):

| # | Base image | Prompt set | Harness / model | Initial prompt |
|---|---|---|---|---|
| 1 | `node20` | `commit-aaabbb` | `claude-code-2.1.311/claude-opus-5-5` | `plain` |
| 2 | `node20` | `commit-aaabbb` | `claude-code-2.1.311/claude-haiku-5-5` | `plain` |
| 3 | `node20` | `commit-bbbccc` | `claude-code-2.1.311/claude-opus-5-5` | `plain` |
| 4 | `node20` | `commit-bbbccc` | `claude-code-2.1.311/claude-haiku-5-5` | `plain` |

Each permutation creates a docker image: 

```dockerfile
# 1. Base image
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \
  && git config --system user.email agent@thunderjar.invalid

WORKDIR /workspace

# 2. Apply the code state
RUN git clone --quiet https://github.com/acme/widgets.git /workspace \
  && git -C /workspace checkout --quiet --detach a1b2c3 \
  && git -C /workspace remote remove origin

# 3. Apply the prompt set
RUN git clone --quiet https://github.com/acme/prompts.git /tmp/prompts \
  && git -C /tmp/prompts checkout --quiet --detach aaabbb \
  && find /workspace -type f \( -name AGENTS.md -o -name CLAUDE.md -o -name SKILL.md \) -delete \
  && cd /tmp/prompts \
  && cp AGENTS.md CLAUDE.md /workspace/ \
  && find . -type f -name SKILL.md -exec cp --parents {} /workspace/ \; \
  && cd /workspace && git add -A && git commit --quiet -m "Thunderjar: apply promptSet"

# 4. Harness
RUN npm install -g @anthropic-ai/claude-code@2.1.311
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node
```


<!-- I think the conceptual model can be tidied up here.  I think baking the selected model and the intial prompt into the image makes sense-->

We then run all the permutations x the number of iterations. 

When the task completes we save the container as a postrun docker image, for each run. 

We then apply measurements against each image, and aggregate the results. `thunderjar show` prints one row per permutation, with each measurement's own aggregate:

| # | Prompt set | Model | Runs | `isPrimeTemplateTest` (mean passed / failed) | `isPrimeTsExists` (rate) | `tsIgnoreCount` (mean / max) |
|---|---|---|---|---|---|---|
| 1 | `commit-aaabbb` | `claude-opus-5-5` | 5/5 | 5.0 / 0.0 | 5/5 | 0.0 / 0 |
| 2 | `commit-aaabbb` | `claude-haiku-5-5` | 5/5 | 4.6 / 0.4 | 5/5 | 0.2 / 1 |
| 3 | `commit-bbbccc` | `claude-opus-5-5` | 5/5 | 5.0 / 0.0 | 5/5 | 0.0 / 0 |
| 4 | `commit-bbbccc` | `claude-haiku-5-5` | 5/5 | 4.8 / 0.2 | 5/5 | 0.0 / 0 |

The aggregates are what you compare between permutations; the individual iterations stay in the run data store.





