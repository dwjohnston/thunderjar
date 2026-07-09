#!/usr/bin/env bash
#
# 🤖
# This file was created with AI
#
# Harness: Claude Code
# Model: claude-sonnet-5
# Supervising engineer: David Johnston
#
# Level of human supervision: None
#
#

# Publish step invoked by changesets/action (see .github/workflows/release.yml).
#
# thunderjar is still "private": true in package.json — there's no settled
# public API boundary yet (see docs/publishing.md). Until a maintainer
# deliberately flips "private" to false, this script skips the actual
# `npm publish` so that merging a "Version Packages" PR can never accidentally
# publish an unready package. Once the package is ready to publish, removing
# "private": true from package.json is enough to make this script fall
# through to the real publish command.

set -euo pipefail

is_private="$(bun -e "console.log(Boolean(require('./package.json').private))")"

if [ "$is_private" = "true" ]; then
  echo "thunderjar: package.json has \"private\": true — skipping npm publish."
  echo "See docs/publishing.md for what needs to happen before this package can be published."
  exit 0
fi

bunx changeset publish
