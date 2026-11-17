# The sample repo image: a codebase that has never had Thunderjar, and each harness's CLI, installed
# but not set up for capture. Thunderjar itself isn't here: the capture Docker tests install it.
# Built by `bun run di:build:sample-repo`, which passes the versions and tags the image by a hash
# of this folder and them.
FROM node:22-slim

ARG BUN_VERSION
ARG CLAUDE_CODE_VERSION
ARG CODEX_VERSION
ARG COPILOT_VERSION
ARG OPENCODE_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global --no-audit --no-fund \
  "bun@${BUN_VERSION}" \
  "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  "@openai/codex@${CODEX_VERSION}" \
  "@github/copilot@${COPILOT_VERSION}" \
  "opencode-ai@${OPENCODE_VERSION}"

COPY --chown=node:node project /work

# Claude Code won't skip its permission prompts as root.
USER node
WORKDIR /work
# Where `bun add --global` puts thunderjar.
ENV PATH=/home/node/.bun/bin:$PATH

RUN git init -q -b main \
  && git config user.name "Sample" \
  && git config user.email "sample@example.com" \
  && git add -A \
  && git commit -q -m "Sample repo"
