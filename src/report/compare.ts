import type { ExperimentResult, MeasurementOutcome } from '../types.ts';

const ICON: Record<MeasurementOutcome['result'], string> = {
  PASS: '✓',
  FAIL: '✗',
  SKIPPED: '—',
};

function measurementKey(m: MeasurementOutcome['measurement']): string {
  switch (m.type) {
    case 'command': return m.run;
    case 'fileCreated': return `fileCreated: ${'path' in m ? m.path : m.glob}`;
    case 'fileExists': return `fileExists: ${m.path}`;
    case 'grep': return `grep '${m.pattern}'`;
    case 'correctness-test': return 'correctness-test';
  }
}

export function renderCompare(results: ExperimentResult[]): void {
  const allKeys = [...new Set(
    results.flatMap(r => r.measurements.map(m => measurementKey(m.measurement)))
  )];

  const colWidth = 16;
  const labelWidth = Math.max(...allKeys.map(k => k.length), 20) + 2;
  const divider = '─'.repeat(labelWidth + colWidth * results.length);

  const header1 = ' '.repeat(labelWidth) +
    results.map(r => r.variables.prompt.padEnd(colWidth)).join('');
  const header2 = ' '.repeat(labelWidth) +
    results.map(r => r.variables.model.split('-').slice(-2).join('-').slice(0, colWidth - 1).padEnd(colWidth)).join('');

  console.log('\n' + divider);
  console.log(header1);
  console.log(header2);
  console.log(divider);

  for (const key of allKeys) {
    const row = results.map(r => {
      const outcome = r.measurements.find(m => measurementKey(m.measurement) === key);
      return (outcome ? ICON[outcome.result] : ' ').padEnd(colWidth);
    }).join('');
    console.log(key.padEnd(labelWidth) + row);
  }

  console.log(divider);

  const durationRow = results.map(r => formatDuration(r.durationSeconds).padEnd(colWidth)).join('');
  console.log('Duration'.padEnd(labelWidth) + durationRow);

  const passRow = results.map(r => {
    const passed = r.measurements.filter(m => m.result === 'PASS').length;
    return `${passed}/${r.measurements.length}`.padEnd(colWidth);
  }).join('');
  console.log('Passed'.padEnd(labelWidth) + passRow);

  console.log(divider + '\n');
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
