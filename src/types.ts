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

export type Prompt = {
  apply: string;  // shell command run in the worktree root to install prompt files
};

export type Experiment = {
  description: string;
  taskId: string;
  commitHash: string;
  variables: {
    models: string[];
    harnesses: string[];
    prompts: string[];
  };
};

export type Commands = {
  testRunner: string;
  setup?: string;
  beforeRun?: string;    // supports {prompt} template variable
  harnesses: Record<string, string>;  // command templates; supports {prompt} and {model}
};

export type BenchConfig = {
  commands: Commands;
  tasks: Record<string, Task>;
  prompts: Record<string, Prompt>;
  experiments: Record<string, Experiment>;
};

export type MeasurementResult = 'PASS' | 'FAIL' | 'SKIPPED';

export type MeasurementOutcome = {
  measurement: Measurement;
  result: MeasurementResult;
  detail?: string;
};

export type RunVariables = {
  taskId: string;
  commitHash: string;
  prompt: string;
  model: string;
  harness: string;
};

export type ExperimentResult = {
  experimentId: string;
  runId: string;
  runAt: string;
  durationSeconds: number;
  variables: RunVariables;
  measurements: MeasurementOutcome[];
};
