import { describe, expect, it } from 'bun:test';
import { evaluateMeasurement, normalizeTaskMeasurements } from './measurements.ts';

describe('normalizeTaskMeasurements', () => {
  it('auto-generates measurement ids in order', () => {
    const normalized = normalizeTaskMeasurements([
      { type: 'fileExists', path: 'a.txt' },
      { measurementId: 'named', measurement: { type: 'fileExists', path: 'b.txt' } },
      { measurement: { type: 'fileExists', path: 'c.txt' } },
    ]);

    expect(normalized.map(m => m.measurementId)).toEqual(['measurement0', 'named', 'measurement2']);
  });
});

describe('evaluateMeasurement', () => {
  it('commandExitCode defaults expectedExitCode to 0', async () => {
    const res = await evaluateMeasurement({
      measurement: { type: 'commandExitCode', run: 'true' },
      ctx: { worktreePath: process.cwd(), exitCode: 0, stdout: '', stderr: '' },
    });

    expect(res.outcome).toBe('measured');
    if (res.outcome === 'measured') {
      expect((res.data as any).ok).toBe(true);
      expect((res.data as any).expectedExitCode).toBe(0);
    }
  });

  it('commandExitCode fails when exit code differs', async () => {
    const res = await evaluateMeasurement({
      measurement: { type: 'commandExitCode', run: 'false', expectedExitCode: 0 },
      ctx: { worktreePath: process.cwd(), exitCode: 0, stdout: '', stderr: '' },
    });

    expect(res.outcome).toBe('measured');
    if (res.outcome === 'measured') {
      expect((res.data as any).ok).toBe(false);
    }
  });
});

