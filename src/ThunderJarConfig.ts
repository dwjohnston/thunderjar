import type {
  Measurement,
  MeasurementResult,
  MeasurerEvaluateContext,
  NestedExperimentVariables,
  RegisteredMeasurer,
  ThunderjarConfig,
} from './types.ts';

export type { MeasurementResult, MeasurerEvaluateContext };

type BuiltinMeasurerConfigs = {
  fileCreated: { path: string } | { glob: string };
  grep: {
    glob: string;
    pattern: string;
    expect: 'absent' | 'present';
    scope?: 'worktree' | 'changed-files' | 'added-lines';
  };
};

type TaskMeasurement<TMeasurerRegistry extends Record<string, unknown>> = {
  [K in keyof TMeasurerRegistry & string]: {
    measurerName: K;
    config: TMeasurerRegistry[K];
  };
}[keyof TMeasurerRegistry & string];

type HarnessCliContext = {
  model: string;
  taskInstruction: string;
  worktreePath: string;
};

type PromptSetCliContext = {
  worktreePath: string;
};

type ConfigureOptions = {
  testRunner?: string;
  onWorktreeCreate?: (ctx: { worktreePath: string }) => string;
  harnessWorkingDirectory?: string;
  setup?: string;
  worktreeCleanupCommitFlags?: string;
};

type ExperimentHarnesses<THarnesses extends Record<string, readonly string[]>> = {
  [K in keyof THarnesses]?: readonly THarnesses[K][number][];
};

type BuilderMeasurement = {
  measurerName: string;
  config: unknown;
};

type BuilderState = {
  configureOptions: ConfigureOptions;
  measurers: Record<string, RegisteredMeasurer>;
  harnesses: Record<string, { models: readonly string[]; cli: (ctx: HarnessCliContext) => string }>;
  promptSets: Record<string, { cli: (ctx: PromptSetCliContext) => string }>;
  tasks: Record<string, { instruction: string; measurements: readonly BuilderMeasurement[] }>;
  experiments: Record<
    string,
    {
      taskName: string;
      commitHash: string;
      variables: NestedExperimentVariables;
    }
  >;
};

const HARNESS_TEMPLATE_CONTEXT: HarnessCliContext = {
  model: '{model}',
  taskInstruction: '$THUNDERJAR_PROMPT',
  worktreePath: '{worktreePath}',
};

const PROMPT_SET_TEMPLATE_CONTEXT: PromptSetCliContext = {
  worktreePath: '{worktreePath}',
};

const WORKTREE_CREATE_TEMPLATE_CONTEXT = { worktreePath: '{worktreePath}' };

function builderMeasurementToLegacy(measurement: BuilderMeasurement): Measurement {
  const { measurerName, config } = measurement;

  if (measurerName === 'fileCreated') {
    const fileConfig = config as { path?: string; glob?: string };
    if (fileConfig.path !== undefined) {
      return { type: 'fileCreated', path: fileConfig.path };
    }
    if (fileConfig.glob !== undefined) {
      return { type: 'fileCreated', glob: fileConfig.glob };
    }
    throw new Error(`Invalid fileCreated measurement config: ${JSON.stringify(config)}`);
  }

  if (measurerName === 'grep') {
    const grepConfig = config as {
      glob: string;
      pattern: string;
      expect: 'absent' | 'present';
      scope?: 'worktree' | 'changed-files' | 'added-lines';
    };
    return { type: 'grep', ...grepConfig };
  }

  return { type: 'measurer', measurerName, config };
}

function createInitialState(): BuilderState {
  return {
    configureOptions: {},
    measurers: {},
    harnesses: {},
    promptSets: {},
    tasks: {},
    experiments: {},
  };
}

export class ThunderJarConfig<
  TMeasurerConfigs extends Record<string, unknown> = BuiltinMeasurerConfigs,
  THarnesses extends Record<string, readonly string[]> = Record<never, never>,
  TPromptSets extends string = never,
  TTasks extends string = never,
> {
  private readonly _state: BuilderState;

  constructor(state: BuilderState = createInitialState()) {
    this._state = state;
  }

  configure(
    options: ConfigureOptions,
  ): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks> {
    this._state.configureOptions = { ...this._state.configureOptions, ...options };
    return this;
  }

  registerMeasurer<
    TConfig,
    TValue,
    const TOptions extends {
      measurerName: string;
      evaluate: (
        config: TConfig,
        context: MeasurerEvaluateContext,
      ) => Promise<MeasurementResult<TValue>>;
    } = {
      measurerName: string;
      evaluate: (
        config: TConfig,
        context: MeasurerEvaluateContext,
      ) => Promise<MeasurementResult<TValue>>;
    },
  >(options: TOptions): ThunderJarConfig<
    TMeasurerConfigs & Record<TOptions['measurerName'], TConfig>,
    THarnesses,
    TPromptSets,
    TTasks
  > {
    this._state.measurers[options.measurerName] = {
      evaluate: options.evaluate as RegisteredMeasurer['evaluate'],
    };
    return this as ThunderJarConfig<
      TMeasurerConfigs & Record<TOptions['measurerName'], TConfig>,
      THarnesses,
      TPromptSets,
      TTasks
    >;
  }

  registerHarness<const TName extends string, const TModels extends readonly string[]>(options: {
    harnessName: TName;
    models: TModels;
    cli: (ctx: HarnessCliContext) => string;
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses & Record<TName, TModels>, TPromptSets, TTasks> {
    this._state.harnesses[options.harnessName] = {
      models: options.models,
      cli: options.cli,
    };
    return this as ThunderJarConfig<
      TMeasurerConfigs,
      THarnesses & Record<TName, TModels>,
      TPromptSets,
      TTasks
    >;
  }

  registerPromptSet<const TName extends string>(options: {
    promptSetName: TName;
    cli: (ctx: PromptSetCliContext) => string;
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets | TName, TTasks> {
    this._state.promptSets[options.promptSetName] = { cli: options.cli };
    return this as ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets | TName, TTasks>;
  }

  registerTask<const TName extends string>(options: {
    taskName: TName;
    instruction: string;
    measurements: readonly TaskMeasurement<TMeasurerConfigs>[];
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks | TName> {
    this._state.tasks[options.taskName] = {
      instruction: options.instruction,
      measurements: options.measurements,
    };
    return this as ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks | TName>;
  }

  registerExperiment(options: {
    experimentName: string;
    taskName: TTasks;
    commitHash: string;
    variables: {
      harnesses: ExperimentHarnesses<THarnesses>;
      promptSets: readonly TPromptSets[];
    };
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks> {
    const harnesses: Record<string, string[]> = {};
    for (const [harnessName, models] of Object.entries(options.variables.harnesses)) {
      if (models !== undefined) {
        harnesses[harnessName] = [...models];
      }
    }

    this._state.experiments[options.experimentName] = {
      taskName: options.taskName,
      commitHash: options.commitHash,
      variables: {
        harnesses,
        promptSets: [...options.variables.promptSets],
      },
    };
    return this;
  }

  construct(): ThunderjarConfig {
    const { configureOptions } = this._state;

    const harnesses: Record<string, string> = {};
    for (const [harnessName, harness] of Object.entries(this._state.harnesses)) {
      harnesses[harnessName] = harness.cli(HARNESS_TEMPLATE_CONTEXT);
    }

    const prompts: ThunderjarConfig['prompts'] = {};
    for (const [promptSetName, promptSet] of Object.entries(this._state.promptSets)) {
      prompts[promptSetName] = { apply: promptSet.cli(PROMPT_SET_TEMPLATE_CONTEXT) };
    }

    const tasks: ThunderjarConfig['tasks'] = {};
    for (const [taskName, task] of Object.entries(this._state.tasks)) {
      tasks[taskName] = {
        description: task.instruction,
        prompt: task.instruction,
        measurements: task.measurements.map(builderMeasurementToLegacy),
      };
    }

    const experiments: ThunderjarConfig['experiments'] = {};
    for (const [experimentName, experiment] of Object.entries(this._state.experiments)) {
      experiments[experimentName] = {
        description: experimentName,
        taskId: experiment.taskName,
        commitHash: experiment.commitHash,
        variables: experiment.variables,
      };
    }

    const measurers =
      Object.keys(this._state.measurers).length > 0 ? { ...this._state.measurers } : undefined;

    return {
      commands: {
        testRunner: configureOptions.testRunner,
        setup: configureOptions.setup,
        harnessWorkingDirectory: configureOptions.harnessWorkingDirectory,
        worktreeCleanupCommitFlags: configureOptions.worktreeCleanupCommitFlags,
        onWorktreeCreate: configureOptions.onWorktreeCreate?.(WORKTREE_CREATE_TEMPLATE_CONTEXT),
        harnesses,
      },
      tasks,
      prompts,
      experiments,
      measurers,
    };
  }
}
