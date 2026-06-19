import path from 'path';
import type { MeasurementOutcome } from '../../types.ts';

export async function measureCorrectnessTest(
  templatePath: string,
  testRunner: string,
  worktree: string,
  configDir: string,
): Promise<MeasurementOutcome> {
  const measurement = { type: 'correctness-test' as const, templatePath };
  const src = path.resolve(configDir, templatePath);
  const dest = path.resolve(worktree, '__thunderjar_correctness__.test.ts');

  try {
    await Bun.write(dest, Bun.file(src));

    const [bin, ...args] = [...testRunner.split(' '), dest];
    const proc = Bun.spawn([bin, ...args], { cwd: worktree, stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    return {
      measurement,
      result: exitCode === 0 ? 'PASS' : 'FAIL',
      detail: exitCode !== 0 ? stderr.trim().split('\n').slice(-5).join('\n') : undefined,
    };
  } finally {
    await Bun.file(dest).exists() && Bun.write(dest, '').then(() =>
      import('fs/promises').then(fs => fs.unlink(dest).catch(() => {}))
    );
  }
}
