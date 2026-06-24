import path from 'node:path';
import type { Measurement, MeasurementResult, MeasurerEvaluateContext, RegisteredMeasurer, TaskMeasurement } from './types.ts';

export type NormalizedTaskMeasurement = {
  measurementId: string;
  measurement: Measurement;
};

export function normalizeTaskMeasurements(measurements: readonly TaskMeasurement[]): NormalizedTaskMeasurement[] {
  return measurements.map((m, i) => {
    if (typeof m === 'object' && m !== null && 'measurement' in m) {
      const wrapped = m as { measurementId?: string; measurement: Measurement };
      return {
        measurementId: wrapped.measurementId ?? `measurement${i}`,
        measurement: wrapped.measurement,
      };
    }
    return { measurementId: `measurement${i}`, measurement: m as Measurement };
  });
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    return await Bun.file(absPath).exists();
  } catch {
    return false;
  }
}

async function globAnyMatches(cwd: string, glob: string): Promise<boolean> {
  const scanner = new Bun.Glob(glob).scan({ cwd });
  for await (const entry of scanner) {
    void entry;
    return true;
  }
  return false;
}

async function grepMatches(cwd: string, glob: string, re: RegExp): Promise<number> {
  let matches = 0;
  for await (const rel of new Bun.Glob(glob).scan({ cwd })) {
    const abs = path.join(cwd, rel);
    const text = await Bun.file(abs).text().catch(() => null);
    if (text === null) continue;
    if (re.test(text)) matches++;
  }
  return matches;
}

export async function evaluateMeasurement(args: {
  measurement: Measurement;
  measurers?: Record<string, RegisteredMeasurer>;
  ctx: MeasurerEvaluateContext;
}): Promise<MeasurementResult<unknown>> {
  const { measurement, measurers, ctx } = args;

  try {
    switch (measurement.type) {
      case 'fileCreated': {
        if ('path' in measurement) {
          const abs = path.join(ctx.worktreePath, measurement.path);
          const ok = await fileExists(abs);
          return { outcome: 'measured', data: { ok, kind: 'path', path: measurement.path } };
        }
        const ok = await globAnyMatches(ctx.worktreePath, measurement.glob);
        return { outcome: 'measured', data: { ok, kind: 'glob', glob: measurement.glob } };
      }

      case 'fileExists': {
        const abs = path.join(ctx.worktreePath, measurement.path);
        const ok = await fileExists(abs);
        return { outcome: 'measured', data: { ok, path: measurement.path } };
      }

      case 'grep': {
        if (measurement.scope && measurement.scope !== 'worktree') {
          return { outcome: 'skipped' };
        }
        let re: RegExp;
        try {
          re = new RegExp(measurement.pattern);
        } catch (e) {
          return { outcome: 'erroredWhileMeasuring', error: e instanceof Error ? e : new Error(String(e)) };
        }
        const count = await grepMatches(ctx.worktreePath, measurement.glob, re);
        const ok = measurement.expect === 'present' ? count > 0 : count === 0;
        return {
          outcome: 'measured',
          data: {
            ok,
            glob: measurement.glob,
            pattern: measurement.pattern,
            expect: measurement.expect,
            matches: count,
          },
        };
      }

      case 'commandExitCode': {
        const expectedExitCode = measurement.expectedExitCode ?? 0;
        const result = await Bun.$`sh -c ${measurement.run}`.cwd(ctx.worktreePath).quiet().nothrow();
        const exitCode = result.exitCode;
        const stdout = result.stdout.toString();
        const stderr = result.stderr.toString();
        return {
          outcome: 'measured',
          data: {
            ok: exitCode === expectedExitCode,
            run: measurement.run,
            expectedExitCode,
            exitCode,
            stdout,
            stderr,
          },
        };
      }

      case 'command': {
        const expectedExitCode = measurement.expectExitCode;
        const result = await Bun.$`sh -c ${measurement.run}`.cwd(ctx.worktreePath).quiet().nothrow();
        const exitCode = result.exitCode;
        const stdout = result.stdout.toString();
        const stderr = result.stderr.toString();
        return {
          outcome: 'measured',
          data: {
            ok: exitCode === expectedExitCode,
            run: measurement.run,
            expectedExitCode,
            exitCode,
            stdout,
            stderr,
          },
        };
      }

      case 'measurer': {
        if (!measurers) return { outcome: 'skipped' };
        const m = measurers[measurement.measurerName];
        if (!m) return { outcome: 'skipped' };
        return await m.evaluate(measurement.config, ctx);
      }

      case 'correctness-test': {
        return { outcome: 'skipped' };
      }

      default: {
        // Exhaustiveness guard
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _never: never = measurement;
        return { outcome: 'skipped' };
      }
    }
  } catch (e) {
    return { outcome: 'erroredWhileMeasuring', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

