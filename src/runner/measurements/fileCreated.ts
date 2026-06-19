import { Glob } from 'bun';
import type { MeasurementOutcome } from '../../types.ts';

export async function measureFileCreated(
  pathOrGlob: { path?: string; glob?: string },
  changedFiles: string[],
): Promise<MeasurementOutcome> {
  const measurement = { type: 'fileCreated' as const, ...pathOrGlob } as any;

  if (pathOrGlob.path) {
    const found = changedFiles.includes(pathOrGlob.path);
    return {
      measurement,
      result: found ? 'PASS' : 'FAIL',
      detail: found ? undefined : `${pathOrGlob.path} not found in changed files`,
    };
  }

  if (pathOrGlob.glob) {
    const glob = new Glob(pathOrGlob.glob);
    const matched = changedFiles.filter(f => glob.match(f));
    return {
      measurement,
      result: matched.length > 0 ? 'PASS' : 'FAIL',
      detail: matched.length > 0 ? undefined : `no changed files matched ${pathOrGlob.glob}`,
    };
  }

  return { measurement, result: 'FAIL', detail: 'must specify path or glob' };
}
