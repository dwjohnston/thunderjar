import { file } from 'bun';
import path from 'path';
import type { MeasurementOutcome } from '../../types.ts';

export async function measureFileExists(
  filePath: string,
  worktree: string,
): Promise<MeasurementOutcome> {
  const measurement = { type: 'fileExists' as const, path: filePath };
  const abs = path.resolve(worktree, filePath);
  const exists = await file(abs).exists();
  return {
    measurement,
    result: exists ? 'PASS' : 'FAIL',
    detail: exists ? undefined : `${filePath} does not exist`,
  };
}
