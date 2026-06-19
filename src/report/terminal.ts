import type { ExperimentResult, MeasurementOutcome } from '../types.ts';

const DIVIDER = '──────────────────────────────────────────';

function icon(result: MeasurementOutcome['result']): string {
  return result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : '—';
}

function label(m: MeasurementOutcome['measurement']): string {
  switch (m.type) {
    case 'command': return `command: ${m.run}`;
    case 'fileCreated': return `fileCreated: ${'path' in m ? m.path : m.glob}`;
    case 'fileExists': return `fileExists: ${m.path}`;
    case 'grep': return `grep ${m.expect} '${m.pattern}' in ${m.glob}`;
    case 'correctness-test': return `correctness-test: ${m.templatePath}`;
  }
}

export function renderRun(result: ExperimentResult): void {
  const config = result.variables;
  const failIndex = result.measurements.findIndex(m => m.result === 'FAIL');
  const total = result.measurements.length;

  console.log('\n' + DIVIDER);
  console.log(` ${result.experimentId} — ${config.approachName}/${config.modelName}`);
  console.log(DIVIDER);
  console.log(` Task      ${result.task}`);
  console.log(` Commit    ${config.commitHash}`);
  console.log(` Approach  ${config.approachName}`);
  console.log(` Model     ${config.modelName}`);
  console.log(` Harness   ${config.harnessName}`);
  console.log(` Duration  ${formatDuration(result.durationSeconds)}`);
  console.log(DIVIDER);

  for (const outcome of result.measurements) {
    const suffix = outcome.result === 'SKIPPED' ? ' (not reached)' : '';
    console.log(` ${icon(outcome.result)}  ${label(outcome.measurement)}${suffix}`);
    if (outcome.detail) {
      console.log(`    → ${outcome.detail}`);
    }
  }

  console.log(DIVIDER);
  if (result.result === 'PASS') {
    console.log(` PASSED`);
  } else {
    console.log(` FAILED — measurement ${failIndex + 1} of ${total}`);
  }
  console.log();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
