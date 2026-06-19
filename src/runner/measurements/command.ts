import { $ } from 'bun';
import type { MeasurementOutcome } from '../../types.ts';

export async function measureCommand(
  run: string,
  expectExitCode: number,
  cwd: string,
): Promise<MeasurementOutcome> {
  const measurement = { type: 'command' as const, run, expectExitCode };
  try {
    const proc = Bun.spawn(run.split(' '), { cwd, stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode === expectExitCode) {
      return { measurement, result: 'PASS' };
    }
    return { measurement, result: 'FAIL', detail: `exit code ${exitCode} (expected ${expectExitCode})` };
  } catch (e) {
    return { measurement, result: 'FAIL', detail: String(e) };
  }
}
