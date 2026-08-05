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

import { describe, expect, it } from 'bun:test';
import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ThunderjarConfig } from '../types.ts';
import { buildInitConfigSource, computeRelativeImportPath } from './initTemplate.ts';

describe('computeRelativeImportPath', () => {
  it('produces a relative, forward-slashed, dot-prefixed path to a sibling directory', () => {
    const result = computeRelativeImportPath('/repos/my-project', '/repos/thunderjar/src/ThunderJarConfig.ts');
    expect(result).toBe('../thunderjar/src/ThunderJarConfig.ts');
  });

  it('prefixes a same-directory-tree path with ./', () => {
    const result = computeRelativeImportPath('/repos/thunderjar', '/repos/thunderjar/src/ThunderJarConfig.ts');
    expect(result).toBe('./src/ThunderJarConfig.ts');
  });
});

describe('buildInitConfigSource', () => {
  it('generates a config that constructs a runnable ThunderjarConfig', async () => {
    const tmpDir = await realpath(os.tmpdir());
    const importPath = computeRelativeImportPath(tmpDir, path.join(import.meta.dir, '..', 'ThunderJarConfig.ts'));
    const source = buildInitConfigSource(importPath);

    const tmpFile = path.join(tmpDir, `thunderjar-init-test-${Date.now()}.ts`);
    await Bun.write(tmpFile, source);
    try {
      const mod = await import(tmpFile);
      const config = mod.default as ThunderjarConfig;

      expect(Object.keys(config.commands.harnesses).sort()).toEqual(['claude-code', 'cursor', 'opencode']);
      expect(Object.keys(config.tasks)).toEqual(['sum-function']);
      expect(Object.keys(config.experiments)).toEqual(['sum-function']);

      const task = config.tasks['sum-function'];
      expect(task?.prompt).toContain('⚡');
      expect(task?.prompt).toContain('assert');
      expect(task?.measurements).toHaveLength(4);

      const experiment = config.experiments['sum-function'];
      expect(experiment?.variables).toEqual({
        harnesses: {
          'claude-code': ['claude-haiku-4-5-20251001'],
          opencode: [
            'opencode/deepseek-v4-flash-free',
            'opencode/north-mini-code-free',
            'opencode/claude-haiku-4-5',
            'opencode/big-pickle',
          ],
          cursor: ['composer-2.5', 'kimi-k2.5'],
        },
        promptSets: ['default'],
      });
    } finally {
      await Bun.file(tmpFile).delete();
    }
  });
});
