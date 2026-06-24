export type Measurement =
  | { type: 'command'; run: string; expectExitCode: number }
  | { type: 'commandExitCode'; run: string; expectedExitCode?: number }
  | { type: 'fileCreated'; path: string }
  | { type: 'fileCreated'; glob: string }
  | { type: 'fileExists'; path: string }
  | { type: 'grep'; glob: string; pattern: string; expect: 'absent' | 'present'; scope?: 'worktree' | 'changed-files' | 'added-lines' }
  | { type: 'correctness-test'; templatePath: string }
  | { type: 'measurer'; measurerName: string; config: unknown }

export type TaskMeasurement =
  | Measurement
  | { measurementId?: string; measurement: Measurement };

export interface Task {
  description: string;
  prompt: string;
  measurements: TaskMeasurement[];
}

export interface Prompt {
  apply: string;
}

export interface LegacyExperimentVariables {
  models: string[];
  harnesses: string[];
  prompts: string[];
}

export interface NestedExperimentVariables {
  harnesses: Record<string, string[]>;
  promptSets: string[];
}

export type ExperimentVariables = LegacyExperimentVariables | NestedExperimentVariables;

export interface Experiment {
  description: string;
  taskId: string;
  commitHash: string;
  variables: ExperimentVariables;
}

export interface Commands {
  testRunner?: string;
  setup?: string;
  onWorktreeCreate?: string;
  harnesses: Record<string, string>;
  harnessWorkingDirectory?: string;
  worktreeCleanupCommitFlags?: string;
}

export type MeasurerEvaluateContext = {
  worktreePath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type MeasurementResult<T> =
  | { outcome: 'measured'; data: T }
  | { outcome: 'skipped' }
  | { outcome: 'erroredWhileMeasuring'; error: Error };

export interface RegisteredMeasurer {
  evaluate: (
    config: unknown,
    context: MeasurerEvaluateContext,
  ) => Promise<MeasurementResult<unknown>>;
}

export interface ThunderjarConfig {
  commands: Commands;
  tasks: Record<string, Task>;
  prompts: Record<string, Prompt>;
  experiments: Record<string, Experiment>;
  measurers?: Record<string, RegisteredMeasurer>;
}
