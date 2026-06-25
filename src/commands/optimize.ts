import chalk from 'chalk';
import { Command, InvalidArgumentError } from 'commander';
import cliState from '../cliState';
import logger from '../logger';
import { optimizePromptTestSuite } from '../optimizer/promptOptimizer';
import telemetry from '../telemetry';
import {
  type CommandLineOptions,
  type EvaluateOptions,
  type TestSuite,
  type UnifiedConfig,
} from '../types/index';
import { resolveConfigs } from '../util/config/load';
import { type FilterOptions, filterTests } from '../util/eval/filterTests';
import { printBorder, setupEnv } from '../util/index';
import { promptfooCommand } from '../util/promptfooCommand';

interface OptimizeOptions {
  config?: string;
  envPath?: string | string[];
  promptIndex?: number;
  providerIndex?: number;
  validationSplit?: number;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}

function applyCommandLineEvaluateOptions(
  config: Partial<UnifiedConfig>,
  commandLineOptions: Partial<CommandLineOptions> | undefined,
): Partial<UnifiedConfig> {
  const overrides: Partial<EvaluateOptions> = {};
  if (commandLineOptions?.delay !== undefined) {
    overrides.delay = commandLineOptions.delay;
  }
  if (commandLineOptions?.filterRange !== undefined) {
    overrides.filterRange = commandLineOptions.filterRange;
  }
  if (commandLineOptions?.maxConcurrency !== undefined) {
    overrides.maxConcurrency = commandLineOptions.maxConcurrency;
  }
  if (commandLineOptions?.repeat !== undefined) {
    overrides.repeat = commandLineOptions.repeat;
  }
  return Object.keys(overrides).length > 0
    ? { ...config, evaluateOptions: { ...config.evaluateOptions, ...overrides } }
    : config;
}

async function applyOptimizationTestFilters(
  config: Partial<UnifiedConfig>,
  testSuite: TestSuite,
  commandLineOptions: Partial<CommandLineOptions> | undefined,
): Promise<{ config: Partial<UnifiedConfig>; testSuite: TestSuite }> {
  const range = config.evaluateOptions?.filterRange;
  const hasScenarios = Boolean(testSuite.scenarios?.length);
  const filterOptions: FilterOptions = {
    errorsOnly: commandLineOptions?.filterErrorsOnly,
    failing: commandLineOptions?.filterFailing,
    failingOnly: commandLineOptions?.filterFailingOnly,
    firstN: commandLineOptions?.filterFirstN,
    metadata: commandLineOptions?.filterMetadata,
    pattern: commandLineOptions?.filterPattern,
    range: hasScenarios ? undefined : range,
    sample: commandLineOptions?.filterSample,
    sampleSeed: commandLineOptions?.filterSampleSeed,
  };
  if (Object.values(filterOptions).every((value) => value === undefined)) {
    return { config, testSuite };
  }

  const explicitTestCount = testSuite.tests?.length ?? 0;
  // A defaultTest-only suite has one implicit row. Sampling cannot reduce it,
  // and the optimizer already delegates range handling to the evaluator.
  if (explicitTestCount === 0 && testSuite.scenarios === undefined) {
    return { config, testSuite };
  }

  const tests = await filterTests(testSuite, filterOptions);
  const shouldSuppressImplicitDefaultTest =
    !hasScenarios && tests.length === 0 && explicitTestCount > 0;

  return {
    config:
      range === undefined || hasScenarios
        ? config
        : { ...config, evaluateOptions: { ...config.evaluateOptions, filterRange: undefined } },
    testSuite: {
      ...testSuite,
      tests,
      ...(shouldSuppressImplicitDefaultTest ? { scenarios: [] } : {}),
    },
  };
}

function getOptimizationConcurrency(config: Partial<UnifiedConfig>): number | undefined {
  const { delay, maxConcurrency } = config.evaluateOptions ?? {};
  return typeof delay === 'number' && !Number.isNaN(delay) && delay > 0 ? 1 : maxConcurrency;
}

export async function doOptimize(options: OptimizeOptions): Promise<void> {
  setupEnv(options.envPath);
  const configPath = options.config || options.defaultConfigPath;
  if (!configPath) {
    throw new Error(
      `Could not find a config file. Pass --config path/to/promptfooconfig.yaml or run "${promptfooCommand(
        'init',
      )}" to create one.`,
    );
  }

  const startTime = Date.now();
  const resolved = await resolveConfigs(
    {
      config: [configPath],
    },
    options.defaultConfig,
  );

  if ((!options.envPath || options.envPath.length === 0) && resolved.commandLineOptions?.envPath) {
    logger.debug(
      `Loading additional environment from config: ${resolved.commandLineOptions.envPath}`,
    );
    setupEnv(resolved.commandLineOptions.envPath);
  }

  telemetry.record('command_used', {
    name: 'optimize - started',
    numPrompts: resolved.testSuite.prompts.length,
    numTests: resolved.testSuite.tests?.length || 0,
    promptIndex: options.promptIndex ?? 0,
    providerIndex: options.providerIndex ?? 0,
    validationSplit: options.validationSplit ?? 0,
  });

  const mergedConfig = applyCommandLineEvaluateOptions(
    resolved.config,
    resolved.commandLineOptions,
  );
  const { config: optimizationConfig, testSuite: optimizationTestSuite } =
    await applyOptimizationTestFilters(
      mergedConfig,
      resolved.testSuite,
      resolved.commandLineOptions,
    );
  const runOptimization = () =>
    optimizePromptTestSuite(optimizationConfig, optimizationTestSuite, {
      promptIndex: options.promptIndex ?? 0,
      providerIndex: options.providerIndex ?? 0,
      validationSplit: options.validationSplit,
    });
  const concurrency = getOptimizationConcurrency(optimizationConfig);
  const result =
    concurrency === undefined
      ? await runOptimization()
      : await cliState.withMaxConcurrency(concurrency, runOptimization);

  printBorder();
  logger.info(chalk.bold('Prompt optimization result'));
  logger.info(
    `Baseline search: ${result.baselinePrompt.label} (${result.baselinePrompt.metrics?.score ?? 'n/a'})`,
  );
  logger.info(
    `Best search: ${result.bestPrompt.label} (${result.bestPrompt.metrics?.score ?? 'n/a'})`,
  );
  if (result.baselineValidationPrompt && result.bestValidationPrompt) {
    logger.info(
      `Baseline validation: ${result.baselineValidationPrompt.label} (${result.baselineValidationPrompt.metrics?.score ?? 'n/a'})`,
    );
    logger.info(
      `Best validation: ${result.bestValidationPrompt.label} (${result.bestValidationPrompt.metrics?.score ?? 'n/a'})`,
    );
  } else {
    logger.info(
      chalk.yellow(
        'Validation split disabled; reported improvement is measured on the optimization set.',
      ),
    );
  }
  logger.info(
    result.improved
      ? chalk.green('Best candidate improved on the baseline.')
      : chalk.yellow('Baseline remains strongest.'),
  );
  printBorder();
  logger.info(chalk.bold('Best prompt'));
  logger.info(result.bestPrompt.raw);
  printBorder();

  telemetry.record('command_used', {
    duration: Math.round((Date.now() - startTime) / 1000),
    name: 'optimize',
    improved: result.improved,
    numCandidates: result.candidates.length,
    numPrompts: resolved.testSuite.prompts.length,
    promptIndex: options.promptIndex ?? 0,
    providerIndex: options.providerIndex ?? 0,
    searchTestCount: result.searchTestCount,
    numTests: resolved.testSuite.tests?.length || 0,
    validationSplit: result.validationSplit ?? 0,
    validationTestCount: result.validationTestCount,
  });
}

function parseValidationSplit(value: string): number {
  const split = Number(value);
  if (!Number.isFinite(split) || split <= 0 || split > 0.5) {
    throw new InvalidArgumentError(
      '--validation-split must be greater than 0 and less than or equal to 0.5',
    );
  }
  return split;
}

function parseSelectionIndex(value: string, flag: '--prompt-index' | '--provider-index'): number {
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new InvalidArgumentError(`${flag} must be a non-negative integer.`);
  }
  return index;
}

function parsePromptIndex(value: string): number {
  return parseSelectionIndex(value, '--prompt-index');
}

function parseProviderIndex(value: string): number {
  return parseSelectionIndex(value, '--provider-index');
}

export function optimizeCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const command = program
    .command('optimize')
    .description('Optimize one prompt against one configured provider')
    .option('-c, --config <path>', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('--prompt-index <index>', 'Zero-based prompt index to optimize', parsePromptIndex, 0)
    .option(
      '--provider-index <index>',
      'Zero-based provider index to optimize against',
      parseProviderIndex,
      0,
    )
    .option(
      '--validation-split <fraction>',
      'Hold out this fraction of tests for validation scoring (0 < n <= 0.5)',
      parseValidationSplit,
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (opts: {
        config?: string;
        envPath?: string | string[];
        promptIndex?: number;
        providerIndex?: number;
        validationSplit?: number;
      }) => {
        try {
          await doOptimize({
            ...opts,
            defaultConfig,
            defaultConfigPath,
          });
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      },
    );

  return command;
}
