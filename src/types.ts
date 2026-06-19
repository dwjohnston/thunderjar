export type GrepScope = 'worktree' | 'changed-files' | 'added-lines';

export type Measurement =
  | { type: 'command'; run: string; expectExitCode: number }
  | { type: 'fileCreated'; path: string }
  | { type: 'fileCreated'; glob: string }
  | { type: 'fileExists'; path: string }
  | { type: 'grep'; glob: string; pattern: string; expect: 'absent' | 'present'; scope?: GrepScope }
  | { type: 'correctness-test'; templatePath: string };

export type Task = {
  description: string;
  prompt: string;
  measurements: Measurement[];
};

export type HarnessName = 'claude-code' | 'opencode';

export type Experiment = {
  description: string;
  task: string;
  commitHash: string;
  approachName: string;
  modelName: string;
  harnessName: HarnessName;
};

export type Commands = {
  testRunner: string;
  beforeRun?: string;
};

export type BenchConfig = {
  commands: Commands;
  tasks: Record<string, Task>;
  experiments: Record<string, Experiment>;
};

export type MeasurementResult = 'PASS' | 'FAIL' | 'SKIPPED';

export type MeasurementOutcome = {
  measurement: Measurement;
  result: MeasurementResult;
  detail?: string;
};

export type ExperimentResult = {
  experimentId: string;
  runAt: string;
  durationSeconds: number;
  task: string;
  variables: {
    commitHash: string;
    approachName: string;
    modelName: string;
    harnessName: HarnessName;
  };
  result: 'PASS' | 'FAIL';
  measurements: MeasurementOutcome[];
};
