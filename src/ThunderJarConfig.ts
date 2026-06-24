import type { ThunderjarConfig } from './types.ts';

export type MeasurementResult<T> =
  | { outcome: 'measured'; data: T }
  | { outcome: 'skipped' }
  | { outcome: 'erroredWhileMeasuring'; error: Error };

type BuiltinMeasurers = 'fileCreated' | 'grep';

type MeasurerEvaluateContext = {
  worktreePath: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

type HarnessCliContext = {
  model: string;
  promptText: string;
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
  TMeasurers extends string = BuiltinMeasurers,
  THarnesses extends Record<string, readonly string[]> = Record<never, never>,
  TPromptSets extends string = never,
  TTasks extends string = never,
> {
  configure(
    _options: ConfigureOptions,
  ): ThunderJarConfig<TMeasurers, THarnesses, TPromptSets, TTasks> {
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
    TMeasurers | TOptions['measurerName'],
    THarnesses,
    TPromptSets,
    TTasks
  > {
    return this as ThunderJarConfig<
      TMeasurers | TOptions['measurerName'],
      THarnesses,
      TPromptSets,
      TTasks
    >;
  }

  registerHarness<const TName extends string, const TModels extends readonly string[]>(_options: {
    harnessName: TName;
    models: TModels;
    cli: (ctx: HarnessCliContext) => string;
  }): ThunderJarConfig<TMeasurers, THarnesses & Record<TName, TModels>, TPromptSets, TTasks> {
    return this as ThunderJarConfig<
      TMeasurers,
      THarnesses & Record<TName, TModels>,
      TPromptSets,
      TTasks
    >;
  }

  registerPromptSet<const TName extends string>(_options: {
    promptSetName: TName;
    cli: (ctx: PromptSetCliContext) => string;
  }): ThunderJarConfig<TMeasurers, THarnesses, TPromptSets | TName, TTasks> {
    return this as ThunderJarConfig<TMeasurers, THarnesses, TPromptSets | TName, TTasks>;
  }

  registerTask<const TName extends string>(_options: {
    taskName: TName;
    instruction: string;
    measurements: readonly {
      measurerName: TMeasurers;
      config: Record<string, unknown>;
    }[];
  }): ThunderJarConfig<TMeasurers, THarnesses, TPromptSets, TTasks | TName> {
    return this as ThunderJarConfig<TMeasurers, THarnesses, TPromptSets, TTasks | TName>;
  }

  registerExperiment(_options: {
    experimentName: string;
    taskName: TTasks;
    commitHash: string;
    variables: {
      harnesses: ExperimentHarnesses<THarnesses>;
      promptSets: readonly TPromptSets[];
    };
  }): ThunderJarConfig<TMeasurers, THarnesses, TPromptSets, TTasks> {
    return this;
  }

  construct(): ThunderjarConfig {
    return {} as ThunderjarConfig;
  }
}
