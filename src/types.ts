export type Measurement =
  | { type: 'command'; run: string; expectExitCode: number }
  | { type: 'fileCreated'; path: string }
  | { type: 'fileCreated'; glob: string }
  | { type: 'fileExists'; path: string }
  | { type: 'grep'; glob: string; pattern: string; expect: 'absent' | 'present'; scope?: 'worktree' | 'changed-files' | 'added-lines' }
  | { type: 'correctness-test'; templatePath: string }

export interface Task {
  description: string;
  prompt: string;
  measurements: Measurement[];
}

export interface Prompt {
  apply: string;
}

export interface ExperimentVariables {
  models: string[];
  harnesses: string[];
  prompts: string[];
}

export interface Experiment {
  description: string;
  taskId: string;
  commitHash: string;
  variables: ExperimentVariables;
}

export interface Commands {
  testRunner?: string;
  setup?: string;
  harnesses: Record<string, string>;
  harnessWorkingDirectory?: string;
  worktreeCleanupCommitFlags?: string;
}

export interface ThunderjarConfig {
  commands: Commands;
  tasks: Record<string, Task>;
  prompts: Record<string, Prompt>;
  experiments: Record<string, Experiment>;
}
