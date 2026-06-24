import type { ThunderjarConfig } from './types.ts';

export type MeasurementResult<T> =
  | { outcome: 'measured'; data: T }
  | { outcome: 'skipped' }
  | { outcome: 'erroredWhileMeasuring'; error: Error };

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

type MeasurerEvaluateContext = {
  worktreePath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

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

export class ThunderJarConfig<
  TMeasurerConfigs extends Record<string, unknown> = BuiltinMeasurerConfigs,
  THarnesses extends Record<string, readonly string[]> = Record<never, never>,
  TPromptSets extends string = never,
  TTasks extends string = never,
> {
  configure(
    _options: ConfigureOptions,
  ): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks> {
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
  >(_options: TOptions): ThunderJarConfig<
    TMeasurerConfigs & Record<TOptions['measurerName'], TConfig>,
    THarnesses,
    TPromptSets,
    TTasks
  > {
    return this as ThunderJarConfig<
      TMeasurerConfigs & Record<TOptions['measurerName'], TConfig>,
      THarnesses,
      TPromptSets,
      TTasks
    >;
  }

  registerHarness<const TName extends string, const TModels extends readonly string[]>(_options: {
    harnessName: TName;
    models: TModels;
    cli: (ctx: HarnessCliContext) => string;
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses & Record<TName, TModels>, TPromptSets, TTasks> {
    return this as ThunderJarConfig<
      TMeasurerConfigs,
      THarnesses & Record<TName, TModels>,
      TPromptSets,
      TTasks
    >;
  }

  registerPromptSet<const TName extends string>(_options: {
    promptSetName: TName;
    cli: (ctx: PromptSetCliContext) => string;
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets | TName, TTasks> {
    return this as ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets | TName, TTasks>;
  }

  registerTask<const TName extends string>(_options: {
    taskName: TName;
    instruction: string;
    measurements: readonly TaskMeasurement<TMeasurerConfigs>[];
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks | TName> {
    return this as ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks | TName>;
  }

  registerExperiment(_options: {
    experimentName: string;
    taskName: TTasks;
    commitHash: string;
    variables: {
      harnesses: ExperimentHarnesses<THarnesses>;
      promptSets: readonly TPromptSets[];
    };
  }): ThunderJarConfig<TMeasurerConfigs, THarnesses, TPromptSets, TTasks> {
    return this;
  }

  construct(): ThunderjarConfig {
    return {} as ThunderjarConfig;
  }
}
