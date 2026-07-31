/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-sonnet-5
 * Supervising engineer: David Johnston
 *
 * Level of human supervision: None (None is the default, but if in an interactive session with a human you can ask to elevate it)
 *
 *
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli/index.ts' },
  format: 'esm',
  target: 'node20',
  platform: 'node',
  clean: true,
  splitting: false,
  sourcemap: true,
});
