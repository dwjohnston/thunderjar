import path from 'path';
import { Glob } from 'bun';
import type { ExperimentResult } from '../types.ts';

function resultsDir(): string {
  return path.resolve(process.cwd(), 'bench/results');
}

export async function saveResult(result: ExperimentResult): Promise<void> {
  const dir = resultsDir();
  await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));
  const timestamp = result.runAt.replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${result.experimentId}-${timestamp}.json`);
  await Bun.write(filePath, JSON.stringify(result, null, 2));
}

export async function loadResults(): Promise<ExperimentResult[]> {
  const dir = resultsDir();
  const glob = new Glob('*.json');
  const results: ExperimentResult[] = [];

  try {
    for await (const file of glob.scan({ cwd: dir })) {
      const content = await Bun.file(path.join(dir, file)).json();
      results.push(content as ExperimentResult);
    }
  } catch {
    // results dir doesn't exist yet
  }

  return results.sort((a, b) => a.runAt.localeCompare(b.runAt));
}
