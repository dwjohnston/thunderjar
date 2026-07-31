import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMeasurement, normalizeTaskMeasurements } from './measurements.ts';

describe('normalizeTaskMeasurements', () => {
  it('auto-generates measurement ids in order', () => {
    const normalized = normalizeTaskMeasurements([
      { type: 'fileExists', path: 'a.txt' },
      { measurementId: 'named', measurement: { type: 'fileExists', path: 'b.txt' } },
      { measurement: { type: 'fileExists', path: 'c.txt' } },
    ]);

    assert.deepStrictEqual(normalized.map(m => m.measurementId), ['measurement0', 'named', 'measurement2']);
  });
});

describe('evaluateMeasurement', () => {
  it('commandExitCode defaults expectedExitCode to 0', async () => {
    const res = await evaluateMeasurement({
      measurement: { type: 'commandExitCode', run: 'true' },
      ctx: { worktreePath: process.cwd(), exitCode: 0, stdout: '', stderr: '' },
    });

    assert.strictEqual(res.outcome, 'measured');
    if (res.outcome === 'measured') {
      assert.strictEqual((res.data as any).ok, true);
      assert.strictEqual((res.data as any).expectedExitCode, 0);
    }
  });

  it('commandExitCode fails when exit code differs', async () => {
    const res = await evaluateMeasurement({
      measurement: { type: 'commandExitCode', run: 'false', expectedExitCode: 0 },
      ctx: { worktreePath: process.cwd(), exitCode: 0, stdout: '', stderr: '' },
    });

    assert.strictEqual(res.outcome, 'measured');
    if (res.outcome === 'measured') {
      assert.strictEqual((res.data as any).ok, false);
    }
  });
});

