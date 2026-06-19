import { Glob } from 'bun';
import path from 'path';
import type { GrepScope, MeasurementOutcome } from '../../types.ts';

type GrepMeasurement = {
  type: 'grep';
  glob: string;
  pattern: string;
  expect: 'absent' | 'present';
  scope?: GrepScope;
};

export async function measureGrep(
  m: GrepMeasurement,
  worktree: string,
  changedFiles: string[],
  addedLines: string,
): Promise<MeasurementOutcome> {
  const scope = m.scope ?? 'added-lines';
  const regex = new RegExp(m.pattern);

  if (scope === 'added-lines') {
    const lines = addedLines
      .split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'));
    const matches = lines.filter(l => regex.test(l));
    return outcome(m, matches.length, 'added lines');
  }

  const glob = new Glob(m.glob);

  let files: string[];
  if (scope === 'changed-files') {
    files = changedFiles.filter(f => glob.match(f)).map(f => path.resolve(worktree, f));
  } else {
    files = [];
    for await (const f of glob.scan({ cwd: worktree })) {
      files.push(path.resolve(worktree, f));
    }
  }

  const hits: string[] = [];
  for (const f of files) {
    const content = await Bun.file(f).text();
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (regex.test(line)) hits.push(`${path.relative(worktree, f)}:${i + 1}`);
    });
  }

  return outcome(m, hits.length, hits.join(', '));
}

function outcome(m: GrepMeasurement, matchCount: number, detail: string): MeasurementOutcome {
  const matched = matchCount > 0;
  const pass = m.expect === 'present' ? matched : !matched;
  return {
    measurement: m,
    result: pass ? 'PASS' : 'FAIL',
    detail: pass ? undefined : `${matchCount} occurrence(s) in ${detail}`,
  };
}
