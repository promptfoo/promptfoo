import fs from 'fs/promises';
import * as path from 'path';

import chalk from 'chalk';
import chokidar from 'chokidar';
import dedent from 'dedent';
import ora from 'ora';
import { z } from 'zod';
import { disableCache } from '../cache';
import cliState from '../cliState';
import { DEFAULT_MAX_CONCURRENCY } from '../constants';
import { getEnvBool, getEnvFloat, getEnvInt, isCI } from '../envars';
import { evaluate, PromptSuggestionsRejectedError } from '../evaluator';
import {
  checkEmailStatusAndMaybeExit,
  EmailValidationError,
  getAuthor,
  promptForEmailUnverified,
} from '../globalConfig/accounts';
import { cloudConfig } from '../globalConfig/cloud';
import logger, { getLogLevel } from '../logger';
import { runDbMigrations } from '../migrate';
import Eval from '../models/eval';
import { loadApiProvider } from '../providers/index';
import { neverGenerateRemote } from '../redteam/remoteGeneration';
import { createShareableUrl, isSharingEnabled } from '../share';
import { generateTable } from '../table';
import telemetry from '../telemetry';
import { EMAIL_OK_STATUS } from '../types/email';
import { isCliEventSource } from '../types/eventSource';
import { CommandLineOptionsSchema, MAX_SUGGESTIONS_COUNT, TestSuiteSchema } from '../types/index';
import { isApiProvider } from '../types/providers';
import { checkCloudPermissions, getEvalConfigFromCloud, getOrgContext } from '../util/cloud';
import { clearConfigCache, loadDefaultConfig } from '../util/config/default';
import { DEFAULT_CONFIG_EXTENSIONS } from '../util/config/extensions';
import {
  ConfigResolutionError,
  logConfigResolutionError,
  resolveConfigs,
} from '../util/config/load';
import { maybeLoadFromExternalFile } from '../util/file';
import { printBorder, setupEnv, writeMultipleOutputs } from '../util/index';
import invariant from '../util/invariant';
import { getOutputFileFormat, SUPPORTED_OUTPUT_FILE_FORMATS } from '../util/outputFormats';
import { promptfooCommand } from '../util/promptfooCommand';
import { checkProviderApiKeys } from '../util/provider';
import { shouldShareResults } from '../util/sharing';
import { TokenUsageTracker } from '../util/tokenUsage';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { isUuid } from '../util/uuid';
import { filterProviders } from './eval/filterProviders';
import { filterTests } from './eval/filterTests';
import { warnIfRedteamConfigHasNoTests } from './eval/redteamWarning';
import { generateEvalSummary } from './eval/summary';
import { deleteErrorResults, getErrorResultIds, recalculatePromptMetrics } from './retry';
import { notCloudEnabledShareInstructions } from './share';
import type { Command } from 'commander';

import type { CommandLineOptions, Scenario, TestSuite, UnifiedConfig } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';
import type { FilterOptions } from './eval/filterTests';

const EvalCommandSchema = CommandLineOptionsSchema.extend({
  help: z.boolean().optional(),
  interactiveProviders: z.boolean().optional(),
  remote: z.boolean().optional(),
  noShare: z.boolean().optional(),
  retryErrors: z.boolean().optional(),
  // CLI alias preserved for the existing --suggest-prompts <n> flag; canonical key is suggestionsCount.
  suggestPrompts: z.coerce.number().int().positive().max(MAX_SUGGESTIONS_COUNT).optional(),
  extension: z.array(z.string()).optional(),
  // Allow --resume or --resume <id>
  resume: z.union([z.string(), z.boolean()]).optional(),
}).partial();

type EvalCommandOptions = z.infer<typeof EvalCommandSchema>;

export class EvalRunError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = 'EvalRunError';
    // POSIX exit codes are 1-255 (0 means success). Coerce silly values to the
    // default rather than letting `exitCode = 0` silently mask a real failure.
    this.exitCode = Number.isInteger(exitCode) && exitCode >= 1 && exitCode <= 255 ? exitCode : 1;
  }
}

function failEvalRun(
  message: string,
  isCliInvocation: boolean,
  options: { logForCli?: () => void; cliFallback?: Eval } = {},
): Eval {
  if (isCliInvocation) {
    (options.logForCli ?? (() => logger.error(chalk.red(message))))();
    process.exitCode = 1;
    // Preserve a real Eval (e.g. a just-completed run flagged for a follow-up
    // failure like watch-mode setup) so downstream summaries don't misreport.
    return options.cliFallback ?? new Eval({}, { persisted: false });
  }

  throw new EvalRunError(message);
}

function handleRecoverableWatchError(error: unknown): boolean {
  if (error instanceof ConfigResolutionError) {
    logConfigResolutionError(error);
    return true;
  }
  if (error instanceof EmailValidationError) {
    // Account helpers already render these user-facing failures.
    return true;
  }
  if (error instanceof EvalRunError || error instanceof PromptSuggestionsRejectedError) {
    logger.error(error.message);
    return true;
  }
  return false;
}

function resolveSuggestionOptions(
  cmdObj: Partial<CommandLineOptions & Command>,
  commandLineOptions: Record<string, any> | undefined,
  evaluateOptions: InternalEvaluateOptions,
): Pick<InternalEvaluateOptions, 'generateSuggestions' | 'suggestionsCount'> {
  const { suggestPrompts } = cmdObj as EvalCommandOptions;

  // --suggest-prompts is itself an enable signal — passing a count opts in even
  // if some other source explicitly set generateSuggestions=false.
  if (suggestPrompts !== undefined) {
    return { generateSuggestions: true, suggestionsCount: suggestPrompts };
  }

  const explicitGenerate =
    cmdObj.generateSuggestions ??
    commandLineOptions?.generateSuggestions ??
    evaluateOptions.generateSuggestions;

  if (explicitGenerate !== true) {
    // Return explicit false so Object.assign clears any truthy default already on options.
    return explicitGenerate === false ? { generateSuggestions: false } : {};
  }

  // Read cmdObj.suggestionsCount too: doEval is exported and non-Commander
  // callers may pass the canonical key directly instead of the suggestPrompts CLI alias.
  const suggestionsCount =
    cmdObj.suggestionsCount ??
    commandLineOptions?.suggestionsCount ??
    evaluateOptions.suggestionsCount;
  return suggestionsCount === undefined
    ? { generateSuggestions: true }
    : { generateSuggestions: true, suggestionsCount };
}

export function showRedteamProviderLabelMissingWarning(testSuite: TestSuite) {
  const hasProviderWithoutLabel = testSuite.providers.some((p) => !p.label);
  if (hasProviderWithoutLabel) {
    logger.warn(
      dedent`
      ${chalk.bold.yellow('Warning')}: Your target (provider) does not have a label specified.

      Labels are used to uniquely identify redteam targets. Please set a meaningful and unique label (e.g., 'helpdesk-search-agent') for your targets/providers in your redteam config.

      Provider ID will be used as a fallback if no label is specified.
      `,
    );
  }
}

export async function doEval(
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
  evaluateOptions: InternalEvaluateOptions,
): Promise<Eval> {
  // Phase 1: Load environment from CLI args (preserves existing behavior)
  setupEnv(cmdObj.envPath);
  const isCliInvocation = isCliEventSource(evaluateOptions);

  let config: Partial<UnifiedConfig> | undefined = undefined;
  let testSuite: TestSuite | undefined = undefined;
  let _basePath: string | undefined = undefined;
  let commandLineOptions: Record<string, any> | undefined = undefined;

  const configArgs = Array.isArray(cmdObj.config)
    ? cmdObj.config
    : typeof cmdObj.config === 'string'
      ? [cmdObj.config]
      : [];
  const uuidConfigArgs = configArgs.filter((configArg) => isUuid(configArg));

  if (configArgs.length > 1 && uuidConfigArgs.length > 0) {
    throw new Error(
      'Cloud config UUID mode supports exactly one -c value. Use: promptfoo eval -c <cloud-config-uuid>',
    );
  }

  if (configArgs.length === 1 && uuidConfigArgs.length === 1) {
    const cloudConfigId = uuidConfigArgs[0];
    if (cmdObj.watch) {
      throw new Error(
        '--watch is not supported when using a cloud config UUID with -c. Use a local config file path for watch mode.',
      );
    }

    try {
      defaultConfig = await getEvalConfigFromCloud(cloudConfigId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load cloud eval config "${cloudConfigId}". ${reason}. Cloud UUID inputs do not fall back to local file paths. Check authentication and that the UUID exists.`,
      );
    }

    cmdObj.config = undefined;
    defaultConfigPath = undefined;
  }

  type EvaluationRunMode = {
    resumeRaw: string | boolean | undefined;
    retryErrors: boolean | undefined;
    resumeEval?: Eval;
    earlyResult?: Eval;
  };

  type EvaluationRuntimeSettings = {
    repeat: number;
    cache: boolean | undefined;
    maxConcurrency: number;
    delay: number;
    explicitMaxConcurrency: number | undefined;
  };

  type EvaluationFilterState = {
    hasScenarios: boolean;
    filterRange: string | undefined;
    shouldApplyRangeToImplicitDefaultTest: boolean;
    explicitTestCountBeforeFiltering: number | undefined;
  };

  const reloadDefaultConfigIfNeeded = async () => {
    if (!defaultConfigPath) {
      return;
    }
    const configDir = path.dirname(defaultConfigPath);
    const configName = path.basename(defaultConfigPath, path.extname(defaultConfigPath));
    const { defaultConfig: newDefaultConfig } = await loadDefaultConfig(configDir, configName);
    defaultConfig = newDefaultConfig;
  };

  const normalizeConfigDirectoryArgs = async () => {
    if (cmdObj.config === undefined) {
      return;
    }
    const configPaths: string[] = Array.isArray(cmdObj.config) ? cmdObj.config : [cmdObj.config];
    for (const configPath of configPaths) {
      const configStats = await fs.stat(configPath).catch(() => undefined);
      if (!configStats?.isDirectory()) {
        continue;
      }
      const { defaultConfig: dirConfig, defaultConfigPath: newConfigPath } =
        await loadDefaultConfig(configPath);
      if (newConfigPath) {
        cmdObj.config = cmdObj.config.filter((path: string) => path !== configPath);
        cmdObj.config.push(newConfigPath);
        defaultConfig = { ...defaultConfig, ...dirConfig };
        continue;
      }
      logger.warn(
        `No configuration file found in directory: ${configPath}. Looked for promptfooconfig.{${DEFAULT_CONFIG_EXTENSIONS.join(',')}}. Run "${promptfooCommand('init')}" or pass --config path/to/promptfooconfig.yaml.`,
      );
    }
  };

  const restorePromptsFromResumeEval = (resumeEval: Eval) => {
    if (!Array.isArray(resumeEval.prompts) || resumeEval.prompts.length === 0) {
      return;
    }
    invariant(testSuite, 'test suite must be resolved before restoring prompts');
    testSuite.prompts = resumeEval.prompts.map(
      (p) =>
        ({
          raw: p.raw,
          label: p.label,
          config: p.config,
        }) as any,
    );
  };

  const resolveResumeEvaluation = async (
    resumeRaw: string | boolean,
    resumeId: string,
  ): Promise<EvaluationRunMode> => {
    if (cmdObj.write === false) {
      return {
        resumeRaw,
        retryErrors: cmdObj.retryErrors,
        earlyResult: failEvalRun(
          'Cannot use --resume with --no-write. Resume functionality requires database persistence.',
          isCliInvocation,
        ),
      };
    }

    const resumeEval = resumeId === 'latest' ? await Eval.latest() : await Eval.findById(resumeId);
    if (!resumeEval) {
      const message = `Could not find evaluation to resume: ${resumeId}`;
      return {
        resumeRaw,
        retryErrors: cmdObj.retryErrors,
        earlyResult: failEvalRun(message, isCliInvocation, {
          logForCli: () => logger.error(message),
        }),
      };
    }

    logger.info(chalk.cyan(`Resuming evaluation ${resumeEval.id}...`));
    ({
      config,
      testSuite,
      basePath: _basePath,
      commandLineOptions,
    } = await resolveConfigs({}, resumeEval.config));
    restorePromptsFromResumeEval(resumeEval);
    cliState.resume = true;
    return { resumeRaw, retryErrors: cmdObj.retryErrors, resumeEval };
  };

  const resolveRetryErrorsEvaluation = async (): Promise<EvaluationRunMode> => {
    if (cmdObj.write === false) {
      return {
        resumeRaw: undefined,
        retryErrors: true,
        earlyResult: failEvalRun(
          'Cannot use --retry-errors with --no-write. Retry functionality requires database persistence.',
          isCliInvocation,
        ),
      };
    }

    logger.info('🔄 Retrying ERROR results from latest evaluation...');
    const latestEval = await Eval.latest();
    if (!latestEval) {
      const message = 'No previous evaluation found to retry errors from';
      return {
        resumeRaw: undefined,
        retryErrors: true,
        earlyResult: failEvalRun(message, isCliInvocation, {
          logForCli: () => logger.error(message),
        }),
      };
    }

    const errorResultIds = await getErrorResultIds(latestEval.id);
    if (errorResultIds.length === 0) {
      logger.info('✅ No ERROR results found in the latest evaluation');
      return { resumeRaw: undefined, retryErrors: true, earlyResult: latestEval };
    }

    logger.info(`Found ${errorResultIds.length} ERROR results to retry`);
    cliState._retryErrorResultIds = errorResultIds;
    logger.info(
      `🔄 Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
    );

    ({
      config,
      testSuite,
      basePath: _basePath,
      commandLineOptions,
    } = await resolveConfigs({}, latestEval.config));
    restorePromptsFromResumeEval(latestEval);
    cliState.resume = true;
    cliState.retryMode = true;
    return { resumeRaw: undefined, retryErrors: true, resumeEval: latestEval };
  };

  const resolveEvaluationRunMode = async (): Promise<EvaluationRunMode> => {
    const resumeRaw = (cmdObj as any).resume as string | boolean | undefined;
    const retryErrors = cmdObj.retryErrors;

    if (resumeRaw && retryErrors) {
      return {
        resumeRaw,
        retryErrors,
        earlyResult: failEvalRun(
          'Cannot use --resume and --retry-errors together. Please use one or the other.',
          isCliInvocation,
        ),
      };
    }

    const resumeId =
      resumeRaw === true || resumeRaw === undefined ? 'latest' : (resumeRaw as string);
    if (resumeRaw) {
      return resolveResumeEvaluation(resumeRaw, resumeId);
    }
    if (retryErrors) {
      return resolveRetryErrorsEvaluation();
    }

    ({
      config,
      testSuite,
      basePath: _basePath,
      commandLineOptions,
    } = await resolveConfigs(cmdObj, defaultConfig));
    return { resumeRaw, retryErrors };
  };

  const applyResolvedConfigSideEffects = () => {
    invariant(config, 'config must be resolved before applying side effects');
    invariant(testSuite, 'test suite must be resolved before applying side effects');

    if ((!cmdObj.envPath || cmdObj.envPath.length === 0) && commandLineOptions?.envPath) {
      logger.debug(`Loading additional environment from config: ${commandLineOptions.envPath}`);
      setupEnv(commandLineOptions.envPath);
    }

    warnIfRedteamConfigHasNoTests(config, testSuite);

    if (
      config.redteam &&
      Array.isArray(config.providers) &&
      config.providers.length > 0 &&
      typeof config.providers[0] === 'object' &&
      config.providers[0].id === 'http'
    ) {
      const maybeUrl: unknown = (config.providers[0] as any)?.config?.url;
      if (typeof maybeUrl === 'string' && maybeUrl.includes('promptfoo.app')) {
        telemetry.record('feature_used', { feature: 'redteam_run_with_example' });
      }
    }

    if (config.evaluateOptions) {
      evaluateOptions = {
        ...evaluateOptions,
        ...config.evaluateOptions,
        eventSource: evaluateOptions.eventSource,
      };
    }
  };

  const resolveRuntimeSettings = (
    resumeRaw: string | boolean | undefined,
    resumeEval: Eval | undefined,
  ): EvaluationRuntimeSettings => {
    if (resumeRaw) {
      const persisted = (resumeEval?.runtimeOptions ||
        config?.evaluateOptions ||
        {}) as InternalEvaluateOptions;
      const repeat =
        Number.isSafeInteger(persisted.repeat || 0) && (persisted.repeat as number) > 0
          ? (persisted.repeat as number)
          : 1;
      const cache = persisted.cache ?? true;
      const maxConcurrency =
        (persisted.maxConcurrency as number | undefined) ?? DEFAULT_MAX_CONCURRENCY;
      const delay = (persisted.delay as number | undefined) ?? 0;
      const explicitMaxConcurrency =
        (resumeEval?.runtimeOptions as InternalEvaluateOptions | undefined)?.maxConcurrency ??
        cmdObj.maxConcurrency ??
        commandLineOptions?.maxConcurrency ??
        evaluateOptions.maxConcurrency;
      return { repeat, cache, maxConcurrency, delay, explicitMaxConcurrency };
    }

    const iterations =
      cmdObj.repeat ?? commandLineOptions?.repeat ?? evaluateOptions.repeat ?? Number.NaN;
    const repeat = Number.isSafeInteger(iterations) && iterations > 0 ? iterations : 1;
    const cache = cmdObj.cache ?? commandLineOptions?.cache ?? evaluateOptions.cache ?? true;
    const maxConcurrency =
      cmdObj.maxConcurrency ??
      commandLineOptions?.maxConcurrency ??
      evaluateOptions.maxConcurrency ??
      DEFAULT_MAX_CONCURRENCY;
    const delay = cmdObj.delay ?? commandLineOptions?.delay ?? evaluateOptions.delay ?? 0;
    const explicitMaxConcurrency =
      cmdObj.maxConcurrency ?? commandLineOptions?.maxConcurrency ?? evaluateOptions.maxConcurrency;
    return { repeat, cache, maxConcurrency, delay, explicitMaxConcurrency };
  };

  const applyRuntimeConcurrencySettings = (settings: EvaluationRuntimeSettings) => {
    let { maxConcurrency } = settings;
    if (settings.cache === false) {
      logger.info('Cache is disabled.');
      disableCache();
    }
    if (settings.delay > 0) {
      maxConcurrency = 1;
      cliState.maxConcurrency = 1;
      logger.info(
        `Running at concurrency=1 because ${settings.delay}ms delay was requested between API calls`,
      );
    } else if (settings.explicitMaxConcurrency !== undefined) {
      cliState.maxConcurrency = settings.explicitMaxConcurrency;
    }
    return { ...settings, maxConcurrency };
  };

  const resolveFilterState = (resumeEval: Eval | undefined): EvaluationFilterState => {
    invariant(testSuite, 'test suite must be resolved before filtering');
    const hasScenarios = Boolean(testSuite.scenarios?.length);
    const explicitTestCountBeforeFiltering = testSuite.tests?.length;
    const resumeRuntimeOptions = resumeEval?.runtimeOptions as InternalEvaluateOptions | undefined;
    const persistedFilterRange =
      typeof resumeRuntimeOptions?.filterRange === 'string'
        ? resumeRuntimeOptions.filterRange
        : undefined;
    const resumeConfigFilterRange = commandLineOptions?.filterRange ?? evaluateOptions.filterRange;
    const resumeFilterRange = persistedFilterRange ?? resumeConfigFilterRange;
    if (resumeEval && cmdObj.filterRange && cmdObj.filterRange !== resumeFilterRange) {
      logger.warn(
        `Ignoring --filter-range ${cmdObj.filterRange}: resuming ${resumeEval.id} with stored range ${resumeFilterRange ?? '(none)'} to preserve test indices.`,
      );
    }
    const filterRange = resumeEval
      ? resumeFilterRange
      : (cmdObj.filterRange ?? commandLineOptions?.filterRange ?? evaluateOptions.filterRange);
    const shouldApplyRangeToImplicitDefaultTest =
      filterRange !== undefined && !hasScenarios && !testSuite.tests?.length;
    return {
      hasScenarios,
      filterRange,
      shouldApplyRangeToImplicitDefaultTest,
      explicitTestCountBeforeFiltering,
    };
  };

  const applyTestFiltering = async (
    resumeEval: Eval | undefined,
    filterState: EvaluationFilterState,
  ) => {
    invariant(testSuite, 'test suite must be resolved before applying filters');
    if (resumeEval) {
      return;
    }
    if (filterState.shouldApplyRangeToImplicitDefaultTest) {
      testSuite.tests = [{}];
    }
    const filterOptions: FilterOptions = {
      failing: cmdObj.filterFailing,
      failingOnly: cmdObj.filterFailingOnly,
      errorsOnly: cmdObj.filterErrorsOnly,
      firstN: cmdObj.filterFirstN,
      metadata: cmdObj.filterMetadata,
      pattern: cmdObj.filterPattern,
      range: filterState.hasScenarios ? undefined : filterState.filterRange,
      sample: cmdObj.filterSample,
    };
    testSuite.tests = await filterTests(testSuite, filterOptions);
    if (
      filterState.filterRange !== undefined &&
      !filterState.hasScenarios &&
      (filterState.explicitTestCountBeforeFiltering !== undefined ||
        filterState.shouldApplyRangeToImplicitDefaultTest) &&
      testSuite.tests.length === 0
    ) {
      testSuite.scenarios = [];
    }
  };

  const ensureRedteamEmailIfNeeded = async () => {
    invariant(config, 'config must be resolved before email checks');
    invariant(testSuite, 'test suite must be resolved before email checks');
    if (
      neverGenerateRemote() ||
      !config.redteam ||
      !config.redteam.plugins ||
      config.redteam.plugins.length === 0 ||
      !testSuite.tests ||
      testSuite.tests.length === 0
    ) {
      return;
    }
    let hasValidEmail = false;
    while (!hasValidEmail) {
      const { emailNeedsValidation } = await promptForEmailUnverified();
      const res = await checkEmailStatusAndMaybeExit({ validate: emailNeedsValidation });
      hasValidEmail = res === EMAIL_OK_STATUS;
    }
  };

  const filterProvidersAndCheckKeys = async (
    resumeEval: Eval | undefined,
  ): Promise<Eval | undefined> => {
    invariant(config, 'config must be resolved before provider checks');
    invariant(testSuite, 'test suite must be resolved before provider checks');
    if (!resumeEval) {
      testSuite.providers = filterProviders(
        testSuite.providers,
        cmdObj.filterProviders || cmdObj.filterTargets,
      );
    }

    const missingApiKeys = checkProviderApiKeys(testSuite.providers);
    if (missingApiKeys.size > 0) {
      const missingKeysMessage = `Missing required API keys: ${Array.from(missingApiKeys.entries())
        .map(([envVar, providerIds]) => `${envVar} (${providerIds.join(', ')})`)
        .join('; ')}`;
      return failEvalRun(missingKeysMessage, isCliInvocation, {
        logForCli: () => {
          for (const [envVar, providerIds] of missingApiKeys) {
            logger.error(chalk.red(`  ✗ Missing ${envVar} (${providerIds.join(', ')})`));
          }
          logger.error('');
          logger.error(`To fix, set the environment variable or use ${chalk.bold('--env-file')}:`);
          for (const envVar of missingApiKeys.keys()) {
            logger.error(`    export ${envVar}=your-api-key-here`);
          }
          logger.error('');
        },
      });
    }

    await checkCloudPermissions(config as UnifiedConfig);
    return undefined;
  };

  const buildEvaluateOptions = (
    runtimeSettings: EvaluationRuntimeSettings,
    filterRange: string | undefined,
  ): InternalEvaluateOptions => ({
    ...evaluateOptions,
    showProgressBar:
      getLogLevel() === 'debug'
        ? false
        : cmdObj.progressBar === undefined
          ? evaluateOptions.showProgressBar === undefined
            ? true
            : evaluateOptions.showProgressBar
          : cmdObj.progressBar !== false,
    repeat: runtimeSettings.repeat,
    delay:
      !Number.isNaN(runtimeSettings.delay) && runtimeSettings.delay > 0
        ? runtimeSettings.delay
        : undefined,
    filterRange,
    maxConcurrency: runtimeSettings.maxConcurrency,
    cache: runtimeSettings.cache,
  });

  const applyEvalOverrides = async (
    resumeEval: Eval | undefined,
    options: InternalEvaluateOptions,
  ) => {
    invariant(testSuite, 'test suite must be resolved before applying overrides');
    if (!resumeEval && cmdObj.grader) {
      if (typeof testSuite.defaultTest === 'string') {
        testSuite.defaultTest = {};
      }
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.options = testSuite.defaultTest.options || {};
      testSuite.defaultTest.options.provider = await loadApiProvider(cmdObj.grader, {
        basePath: cliState.basePath,
      });
      if (cliState.config) {
        if (typeof cliState.config.defaultTest === 'string') {
          cliState.config.defaultTest = {};
        }
        cliState.config.defaultTest = cliState.config.defaultTest || {};
        cliState.config.defaultTest.options = cliState.config.defaultTest.options || {};
        cliState.config.defaultTest.options.provider = testSuite.defaultTest.options.provider;
      }
    }
    if (!resumeEval && cmdObj.var) {
      if (typeof testSuite.defaultTest === 'string') {
        testSuite.defaultTest = {};
      }
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.vars = { ...testSuite.defaultTest.vars, ...cmdObj.var };
    }
    if (!resumeEval) {
      Object.assign(options, resolveSuggestionOptions(cmdObj, commandLineOptions, options));
    }
  };

  const loadScenarioFiles = async () => {
    invariant(testSuite, 'test suite must be resolved before loading scenarios');
    if (testSuite.scenarios) {
      testSuite.scenarios = (await maybeLoadFromExternalFile(testSuite.scenarios)) as Scenario[];
      testSuite.scenarios = testSuite.scenarios.flat();
    }
    for (const scenario of testSuite.scenarios || []) {
      if (scenario.tests) {
        scenario.tests = await maybeLoadFromExternalFile(scenario.tests);
      }
    }
  };

  const validateResolvedTestSuite = () => {
    invariant(testSuite, 'test suite must be resolved before schema validation');
    const testSuiteSchema = TestSuiteSchema.safeParse(testSuite);
    if (testSuiteSchema.success) {
      return;
    }
    logger.warn(
      chalk.yellow(dedent`
    TestSuite Schema Validation Error:

      ${z.prettifyError(testSuiteSchema.error)}

    Please review your promptfooconfig.yaml configuration.`),
    );
  };

  const createEvalRecord = async (
    resumeEval: Eval | undefined,
    options: InternalEvaluateOptions,
  ) => {
    invariant(config, 'config must be resolved before creating eval record');
    invariant(testSuite, 'test suite must be resolved before creating eval record');
    const author = getAuthor();
    return resumeEval
      ? resumeEval
      : cmdObj.write
        ? await Eval.create(config, testSuite.prompts, { author, runtimeOptions: options })
        : new Eval(config, { author, runtimeOptions: options });
  };

  const setupAbortHandling = () => {
    const abortController = new AbortController();
    const previousAbortSignal = evaluateOptions.abortSignal;
    evaluateOptions.abortSignal = previousAbortSignal
      ? AbortSignal.any([previousAbortSignal, abortController.signal])
      : abortController.signal;

    let paused = false;
    let sigintHandler: NodeJS.SignalsListener | undefined;
    let forceExitTimeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (sigintHandler) {
        process.removeListener('SIGINT', sigintHandler);
        sigintHandler = undefined;
      }
      if (forceExitTimeout) {
        clearTimeout(forceExitTimeout);
        forceExitTimeout = undefined;
      }
      evaluateOptions.abortSignal = previousAbortSignal;
    };

    if (isCliInvocation && cmdObj.write !== false) {
      sigintHandler = () => {
        const wasPaused = paused;
        paused = true;
        if (wasPaused) {
          if (forceExitTimeout) {
            clearTimeout(forceExitTimeout);
            forceExitTimeout = undefined;
          }
          logger.warn('Force exiting...');
          process.exit(130);
        }
        logger.info(chalk.yellow('Pausing evaluation... Press Ctrl+C again to force exit.'));
        abortController.abort();
        forceExitTimeout = setTimeout(() => {
          logger.warn('Evaluation shutdown timed out, force exiting...');
          process.exit(130);
        }, 10000).unref();
      };
      process.on('SIGINT', sigintHandler);
    }

    return {
      get paused() {
        return paused;
      },
      cleanup,
    };
  };

  const runEvaluator = async ({
    testSuite,
    evalRecord,
    options,
    filterRange,
    hasScenarios,
    resumeEval,
    retryErrors,
    abortState,
  }: {
    testSuite: TestSuite;
    evalRecord: Eval;
    options: InternalEvaluateOptions;
    filterRange: string | undefined;
    hasScenarios: boolean;
    resumeEval: Eval | undefined;
    retryErrors: boolean | undefined;
    abortState: ReturnType<typeof setupAbortHandling>;
  }) => {
    let ret;
    try {
      ret = await evaluate(testSuite, evalRecord, {
        ...options,
        filterRange: hasScenarios || resumeEval ? filterRange : undefined,
        abortSignal: evaluateOptions.abortSignal,
        isRedteam: Boolean(config?.redteam),
      });
      if (retryErrors && cliState._retryErrorResultIds && !abortState.paused) {
        const errorResultIds = cliState._retryErrorResultIds;
        try {
          await deleteErrorResults(errorResultIds);
          await recalculatePromptMetrics(ret);
          logger.debug(
            `Cleaned up ${errorResultIds.length} old ERROR results after successful retry`,
          );
        } catch (cleanupError) {
          logger.warn('Post-retry cleanup had issues. Retry results are saved.', {
            error: cleanupError,
          });
        } finally {
          delete cliState._retryErrorResultIds;
          cliState.retryMode = false;
        }
      }
      return ret;
    } finally {
      abortState.cleanup();
    }
  };

  const handlePausedEval = (paused: boolean, evalRecord: Eval, ret: Eval) => {
    if (!paused || cmdObj.write === false) {
      return undefined;
    }
    printBorder();
    logger.info(`${chalk.yellow('⏸')} Evaluation paused. ID: ${chalk.cyan(evalRecord.id)}`);
    logger.info(`» Resume with: ${chalk.green.bold('promptfoo eval --resume ' + evalRecord.id)}`);
    printBorder();
    return ret;
  };

  type EvalShareState = {
    wantsToShare: boolean;
    hasExplicitDisable: boolean;
    canShareEval: boolean;
    willShare: boolean;
    sharePromise: Promise<string | null> | null;
  };

  type EvalMetricsSummary = {
    successes: number;
    failures: number;
    errors: number;
    totalTests: number;
    passRate: number;
    tokenUsage: ReturnType<typeof createEmptyTokenUsage>;
  };

  const createEvalShareState = (evalRecord: Eval): EvalShareState => {
    invariant(config, 'config must be resolved before sharing');
    const wantsToShare = shouldShareResults({
      cliShare: cmdObj.share,
      cliNoShare: cmdObj.noShare,
      configShare: commandLineOptions?.share,
      configSharing: config.sharing,
    });
    const hasExplicitDisable =
      cmdObj.share === false || cmdObj.noShare === true || getEnvBool('PROMPTFOO_DISABLE_SHARING');
    const canShareEval = isSharingEnabled(evalRecord);
    const willShare = wantsToShare && canShareEval;

    logger.debug(`Wants to share: ${wantsToShare}`);
    logger.debug(`Can share eval: ${canShareEval}`);

    return {
      wantsToShare,
      hasExplicitDisable,
      canShareEval,
      willShare,
      sharePromise: willShare ? createShareableUrl(evalRecord, { silent: true }) : null,
    };
  };

  const collectEvalMetrics = (evalRecord: Eval): EvalMetricsSummary => {
    let successes = 0;
    let failures = 0;
    let errors = 0;
    const tokenUsage = createEmptyTokenUsage();

    for (const prompt of evalRecord.prompts) {
      successes += prompt.metrics?.testPassCount ?? 0;
      failures += prompt.metrics?.testFailCount ?? 0;
      errors += prompt.metrics?.testErrorCount ?? 0;
      accumulateTokenUsage(tokenUsage, prompt.metrics?.tokenUsage);
    }

    const totalTests = successes + failures + errors;
    return {
      successes,
      failures,
      errors,
      totalTests,
      passRate: totalTests === 0 ? Number.NaN : (successes / totalTests) * 100,
      tokenUsage,
    };
  };

  const renderEvalTable = async (evalRecord: Eval, metrics: EvalMetricsSummary) => {
    if (cmdObj.table && getLogLevel() !== 'debug' && metrics.totalTests < 500) {
      const table = await evalRecord.getTable();
      const outputTable = generateTable(
        table,
        cmdObj.tableCellMaxLength ?? commandLineOptions?.tableCellMaxLength,
      );

      logger.info('\n' + outputTable.toString());
      if (table.body.length > 25) {
        const rowsLeft = table.body.length - 25;
        logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
      }
    } else if (metrics.failures !== 0) {
      logger.debug(
        `At least one evaluation failure occurred. This might be caused by the underlying call to the provider, or a test failure. Context: \n${JSON.stringify(
          evalRecord.prompts,
        )}`,
      );
    }

    if (metrics.totalTests >= 500) {
      logger.info('Skipping table output because there are more than 500 tests.');
    }
  };

  const getOutputPaths = () => {
    invariant(config, 'config must be resolved before output path resolution');
    const { outputPath } = config;
    return (Array.isArray(outputPath) ? outputPath : [outputPath]).filter(
      (outputFile): outputFile is string =>
        typeof outputFile === 'string' && outputFile.length > 0 && !outputFile.endsWith('.jsonl'),
    );
  };

  const logEvalSummary = async ({
    evalRecord,
    shareState,
    metrics,
    startTime,
    maxConcurrency,
  }: {
    evalRecord: Eval;
    shareState: EvalShareState;
    metrics: EvalMetricsSummary;
    startTime: number;
    maxConcurrency: number;
  }) => {
    invariant(config, 'config must be resolved before summary generation');
    const isRedteam = Boolean(config.redteam);
    const duration = Math.round((Date.now() - startTime) / 1000);
    const tracker = TokenUsageTracker.getInstance();
    const targetErrorStatus = await evalRecord.findTargetErrorStatus();
    const summaryLines = generateEvalSummary({
      evalId: evalRecord.id,
      isRedteam,
      writeToDatabase: cmdObj.write !== false,
      shareableUrl: null,
      wantsToShare: shareState.wantsToShare,
      hasExplicitDisable: shareState.hasExplicitDisable,
      cloudEnabled: cloudConfig.isEnabled(),
      activelySharing: shareState.willShare,
      tokenUsage: metrics.tokenUsage,
      successes: metrics.successes,
      failures: metrics.failures,
      errors: metrics.errors,
      duration,
      maxConcurrency,
      tracker,
      targetErrorStatus,
    });

    if (cmdObj.write && shareState.wantsToShare && !shareState.canShareEval) {
      logger.info(summaryLines[0]);
      notCloudEnabledShareInstructions();
      for (let i = 1; i < summaryLines.length; i++) {
        if (summaryLines[i].includes('View results:')) {
          while (i < summaryLines.length && !summaryLines[i].includes('Total Tokens:')) {
            i++;
          }
          i--;
        } else {
          logger.info(summaryLines[i]);
        }
      }
    } else {
      for (const line of summaryLines) {
        logger.info(line);
      }
    }

    return { isRedteam };
  };

  const completeEvalShare = async (evalRecord: Eval, shareState: EvalShareState) => {
    if (shareState.sharePromise == null) {
      return null;
    }

    const orgContext = await getOrgContext();
    const orgSuffix = orgContext
      ? ` to ${orgContext.organizationName}${orgContext.teamName ? ` > ${orgContext.teamName}` : ''}`
      : '';

    if (process.stdout.isTTY && !isCI()) {
      const spinner = ora({
        text: `Sharing${orgSuffix}...`,
        prefixText: chalk.dim('»'),
        spinner: 'dots',
      }).start();

      try {
        const shareableUrl = await shareState.sharePromise;
        if (shareableUrl) {
          evalRecord.shared = true;
          spinner.succeed(shareableUrl);
        } else {
          spinner.fail(chalk.red('Share failed'));
        }
        return shareableUrl;
      } catch (error) {
        spinner.fail(chalk.red('Share failed'));
        logger.debug(`Share error: ${error}`);
        return null;
      }
    }

    try {
      const shareableUrl = await shareState.sharePromise;
      if (shareableUrl) {
        evalRecord.shared = true;
        logger.info(`${chalk.dim('»')} ${chalk.green('✓')} ${shareableUrl}`);
      }
      return shareableUrl;
    } catch (error) {
      logger.debug(`Share error: ${error}`);
      return null;
    }
  };

  const writeEvalOutputs = async (
    paths: string[],
    evalRecord: Eval,
    shareableUrl: string | null,
  ) => {
    if (!paths.length) {
      return;
    }
    await writeMultipleOutputs(paths, evalRecord, shareableUrl);
    logger.info(chalk.yellow(`Writing output to ${paths.join(', ')}`));
  };

  const reportCompletedEvaluation = async ({
    evalRecord,
    startTime,
    maxConcurrency,
  }: {
    evalRecord: Eval;
    startTime: number;
    maxConcurrency: number;
  }) => {
    evalRecord.clearResults();
    const shareState = createEvalShareState(evalRecord);
    const metrics = collectEvalMetrics(evalRecord);
    await renderEvalTable(evalRecord, metrics);
    const paths = getOutputPaths();
    const { isRedteam } = await logEvalSummary({
      evalRecord,
      shareState,
      metrics,
      startTime,
      maxConcurrency,
    });
    const shareableUrl = await completeEvalShare(evalRecord, shareState);
    logger.debug(`Shareable URL: ${shareableUrl}`);
    await writeEvalOutputs(paths, evalRecord, shareableUrl);
    telemetry.record('command_used', {
      name: 'eval',
      watch: Boolean(cmdObj.watch),
      duration: Math.round((Date.now() - startTime) / 1000),
      isRedteam,
    });
    return { passRate: metrics.passRate, isRedteam };
  };

  const getConfiguredWatchPaths = () => {
    invariant(config, 'config must be resolved before watch path resolution');
    const configPaths = (cmdObj.config || [defaultConfigPath]).filter(Boolean) as string[];
    if (!configPaths.length) {
      return { configPaths, watchPaths: [] as string[] };
    }

    const basePath = path.dirname(configPaths[0]);
    const promptPaths = Array.isArray(config.prompts)
      ? (config.prompts
          .map((prompt) => {
            if (typeof prompt === 'string' && prompt.startsWith('file://')) {
              return path.resolve(basePath, prompt.slice('file://'.length));
            }
            if (typeof prompt === 'object' && prompt.id && prompt.id.startsWith('file://')) {
              return path.resolve(basePath, prompt.id.slice('file://'.length));
            }
            return null;
          })
          .filter(Boolean) as string[])
      : [];
    const providerPaths = Array.isArray(config.providers)
      ? (config.providers
          .map((provider) =>
            typeof provider === 'string' && provider.startsWith('file://')
              ? path.resolve(basePath, provider.slice('file://'.length))
              : null,
          )
          .filter(Boolean) as string[])
      : [];
    const varPaths = Array.isArray(config.tests)
      ? config.tests
          .flatMap((test) => {
            if (typeof test === 'string' && test.startsWith('file://')) {
              return path.resolve(basePath, test.slice('file://'.length));
            }
            if (typeof test !== 'string' && 'vars' in test && test.vars) {
              return Object.values(test.vars).flatMap((value) =>
                typeof value === 'string' && value.startsWith('file://')
                  ? path.resolve(basePath, value.slice('file://'.length))
                  : [],
              );
            }
            return [];
          })
          .filter(Boolean)
      : [];

    return {
      configPaths,
      watchPaths: Array.from(
        new Set([...configPaths, ...promptPaths, ...providerPaths, ...varPaths]),
      ),
    };
  };

  const setupWatchMode = async (
    initialization: boolean | undefined,
    resumeEval: Eval | undefined,
    ret: Eval,
  ): Promise<Eval | undefined> => {
    if (!cmdObj.watch || resumeEval || !initialization) {
      return undefined;
    }

    const { configPaths, watchPaths } = getConfiguredWatchPaths();
    if (!configPaths.length) {
      const message = `Could not locate config file(s) to watch. Pass --config path/to/promptfooconfig.yaml or run from a directory containing promptfooconfig.{${DEFAULT_CONFIG_EXTENSIONS.join(
        ',',
      )}}.`;
      return failEvalRun(message, isCliInvocation, {
        logForCli: () => logger.error(message),
        cliFallback: ret,
      });
    }

    const watcher = chokidar.watch(watchPaths, { ignored: /^\./, persistent: true });
    watcher
      .on('change', async (changedPath) => {
        printBorder();
        logger.info(`File change detected: ${changedPath}`);
        printBorder();
        clearConfigCache();
        try {
          await runEvaluation();
        } catch (error) {
          if (handleRecoverableWatchError(error)) {
            return;
          }
          throw error;
        }
      })
      .on('error', (error) => logger.error(`Watcher error: ${error}`))
      .on('ready', () =>
        watchPaths.forEach((watchPath) =>
          logger.info(`Watching for file changes on ${watchPath} ...`),
        ),
      );
    return undefined;
  };

  const applyPassRateExitCode = (
    passRate: number,
    resumeEval: Eval | undefined,
    ret: Eval,
  ): Eval | undefined => {
    if (cmdObj.watch && !resumeEval) {
      return undefined;
    }

    const passRateThreshold = getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD', 100);
    const failedTestExitCode = getEnvInt('PROMPTFOO_FAILED_TEST_EXIT_CODE', 100);
    const threshold = Number.isFinite(passRateThreshold) ? passRateThreshold : 100;
    if (!isCliInvocation || !(passRate < threshold)) {
      return undefined;
    }

    if (getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD') !== undefined) {
      logger.info(
        chalk.white(
          `Pass rate ${chalk.red.bold(passRate.toFixed(2))}${chalk.red('%')} is below the threshold of ${chalk.red.bold(passRateThreshold)}${chalk.red('%')}`,
        ),
      );
    }
    process.exitCode = Number.isSafeInteger(failedTestExitCode) ? failedTestExitCode : 100;
    return ret;
  };

  const showRedteamWarningIfNeeded = () => {
    invariant(testSuite, 'test suite must be resolved before warning checks');
    if (testSuite.redteam) {
      showRedteamProviderLabelMissingWarning(testSuite);
    }
  };

  const cleanupApiProviders = async () => {
    invariant(testSuite, 'test suite must be resolved before provider cleanup');
    for (const provider of testSuite.providers) {
      if (!isApiProvider(provider)) {
        continue;
      }
      const cleanup = provider?.cleanup?.();
      if (cleanup instanceof Promise) {
        await cleanup;
      }
    }
  };

  const handlePostEvaluationFlow = async ({
    initialization,
    resumeEval,
    ret,
    passRate,
  }: {
    initialization: boolean | undefined;
    resumeEval: Eval | undefined;
    ret: Eval;
    passRate: number;
  }) => {
    const watchResult = await setupWatchMode(initialization, resumeEval, ret);
    if (watchResult) {
      return watchResult;
    }

    const thresholdResult = applyPassRateExitCode(passRate, resumeEval, ret);
    if (thresholdResult) {
      return thresholdResult;
    }

    showRedteamWarningIfNeeded();
    await cleanupApiProviders();
    return ret;
  };

  const runEvaluation = async (initialization?: boolean) => {
    const startTime = Date.now();
    telemetry.record('command_used', {
      name: 'eval - started',
      watch: Boolean(cmdObj.watch),
      // Only set when redteam is enabled for sure, because we don't know if config is loaded yet
      ...(Boolean(config?.redteam) && { isRedteam: true }),
    });

    if (cmdObj.write) {
      await runDbMigrations();
    }

    await reloadDefaultConfigIfNeeded();
    await normalizeConfigDirectoryArgs();

    const runMode = await resolveEvaluationRunMode();
    if (runMode.earlyResult) {
      return runMode.earlyResult;
    }
    const { resumeRaw, retryErrors, resumeEval } = runMode;

    applyResolvedConfigSideEffects();
    invariant(config, 'config must be resolved before evaluation');
    invariant(testSuite, 'test suite must be resolved before evaluation');

    let runtimeSettings = resolveRuntimeSettings(resumeRaw, resumeEval);
    runtimeSettings = applyRuntimeConcurrencySettings(runtimeSettings);
    const filterState = resolveFilterState(resumeEval);
    await applyTestFiltering(resumeEval, filterState);
    await ensureRedteamEmailIfNeeded();
    const providerCheckResult = await filterProvidersAndCheckKeys(resumeEval);
    if (providerCheckResult) {
      return providerCheckResult;
    }

    const options = buildEvaluateOptions(runtimeSettings, filterState.filterRange);
    const { filterRange, hasScenarios } = filterState;
    const { maxConcurrency } = runtimeSettings;

    await applyEvalOverrides(resumeEval, options);
    await loadScenarioFiles();
    validateResolvedTestSuite();

    const evalRecord = await createEvalRecord(resumeEval, options);
    const abortState = setupAbortHandling();
    const ret = await runEvaluator({
      testSuite,
      evalRecord,
      options,
      filterRange,
      hasScenarios,
      resumeEval,
      retryErrors,
      abortState,
    });

    // Clear resume flag after run completes
    cliState.resume = false;

    const pausedResult = handlePausedEval(abortState.paused, evalRecord, ret);
    if (pausedResult) {
      return pausedResult;
    }

    const { passRate } = await reportCompletedEvaluation({
      evalRecord,
      startTime,
      maxConcurrency,
    });
    return handlePostEvaluationFlow({ initialization, resumeEval, ret, passRate });
  };

  return await runEvaluation(true /* initialization */);
}

export function evalCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const evaluateOptions: InternalEvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.suggestionsCount = defaultConfig.evaluateOptions.suggestionsCount;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
  }

  const evalCmd = program
    .command('eval')
    .description('Evaluate prompts')

    // Core configuration
    .option(
      '-c, --config <paths...>',
      'Path to configuration file or cloud config UUID. Automatically loads promptfooconfig.yaml',
    )

    // Input sources
    .option('-a, --assertions <path>', 'Path to assertions file')
    .option('-p, --prompts <paths...>', 'Paths to prompt files (.txt)')
    .option(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
    )
    .option('-t, --tests <path>', 'Path to CSV with test cases')
    .option(
      '-v, --vars <path>',
      'Path to CSV with test cases (alias for --tests)',
      defaultConfig?.commandLineOptions?.vars,
    )
    .option('--model-outputs <path>', 'Path to JSON containing list of LLM output strings')

    // Prompt modification
    .option(
      '--prompt-prefix <path>',
      'This prefix is prepended to every prompt',
      typeof defaultConfig.defaultTest === 'object'
        ? defaultConfig.defaultTest?.options?.prefix
        : undefined,
    )
    .option(
      '--prompt-suffix <path>',
      'This suffix is appended to every prompt.',
      typeof defaultConfig.defaultTest === 'object'
        ? defaultConfig.defaultTest?.options?.suffix
        : undefined,
    )
    .option(
      '--var <key=value>',
      'Set a variable in key=value format',
      (value, previous) => {
        const [key, val] = value.split('=');
        if (!key || val === undefined) {
          throw new Error('--var must be specified in key=value format.');
        }
        return { ...previous, [key]: val };
      },
      {},
    )

    // Execution control
    .option(
      '-j, --max-concurrency <number>',
      `Maximum number of concurrent API calls (default: ${DEFAULT_MAX_CONCURRENCY})`,
    )
    .option('--repeat <number>', 'Number of times to run each test (default: 1)')
    .option('--delay <number>', 'Delay between each test (in milliseconds) (default: 0)')
    .option(
      '--no-cache',
      'Do not read or write results to disk cache',
      defaultConfig?.commandLineOptions?.cache ?? defaultConfig?.evaluateOptions?.cache,
    )
    .option('--remote', 'Force remote inference wherever possible (used for red teams)', false)

    // Filtering and subset selection
    .option('-n, --filter-first-n <number>', 'Only run the first N tests')
    .option(
      '--filter-pattern <pattern>',
      'Only run tests whose description matches the regular expression pattern',
    )
    .option(
      '--filter-range <start:end>',
      'Only run tests whose zero-based index is in the range. End is exclusive (e.g. 0:10, 10:20, 10:, :10)',
    )
    .option(
      '--filter-prompts <pattern>',
      'Only run tests with prompts whose id or label matches the regex pattern',
    )
    .option(
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .option('--filter-sample <number>', 'Only run a random sample of N tests')
    .option(
      '--filter-failing <path or id>',
      'Path to json output file or eval ID to filter non-passing tests from (failures + errors)',
    )
    .option(
      '--filter-failing-only <path or id>',
      'Path to json output file or eval ID to filter assertion failures from (excludes errors)',
    )
    .option(
      '--filter-errors-only <path or id>',
      'Path to json output file or eval ID to filter error tests from',
    )
    .option(
      '--filter-metadata <key=value>',
      'Only run tests whose metadata matches the key=value pair. Can be specified multiple times for AND logic (e.g. --filter-metadata type=unit --filter-metadata env=prod)',
      (value: string, previous: string[] | undefined) => {
        return previous ? [...previous, value] : [value];
      },
    )

    // Output configuration
    .option(
      '-o, --output <paths...>',
      `Path to output file (${SUPPORTED_OUTPUT_FILE_FORMATS.join(', ')}), default is no output file`,
    )
    .option('--table', 'Output table in CLI', defaultConfig?.commandLineOptions?.table ?? true)
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option('--table-cell-max-length <number>', 'Truncate console table cells to this length')
    .option('--share', 'Create a shareable URL', defaultConfig?.commandLineOptions?.share)
    .option('--no-share', 'Do not share, this overrides the config file')
    .option(
      '--resume [evalId]',
      'Resume a paused/incomplete evaluation. Defaults to latest when omitted',
    )
    .option('--retry-errors', 'Retry all ERROR results from the latest evaluation')
    .option(
      '--no-write',
      'Do not write results to promptfoo directory',
      defaultConfig?.commandLineOptions?.write,
    )

    // Additional features
    .option(
      '--grader <provider>',
      'Model that will grade outputs',
      defaultConfig?.commandLineOptions?.grader,
    )
    .option(
      '--suggest-prompts <number>',
      `Generate N new prompts (1-${MAX_SUGGESTIONS_COUNT}) and append them to the prompt list`,
    )
    .option('-w, --watch', 'Watch for changes in config and re-run')
    .option(
      '-x, --extension <paths...>',
      'Extension hooks to run (e.g., file://handler.js:afterAll)',
    )

    // Miscellaneous
    .option('--description <description>', 'Description of the eval run')
    .option('--no-progress-bar', 'Do not show progress bar')
    .action(async (opts: EvalCommandOptions, command: Command) => {
      let validatedOpts: z.infer<typeof EvalCommandSchema>;
      try {
        validatedOpts = EvalCommandSchema.parse(opts);
      } catch (err) {
        logger.error(dedent`
        Invalid command options:
        ${err instanceof z.ZodError ? z.prettifyError(err) : err}
        `);
        process.exitCode = 1;
        return;
      }
      if (command.args.length > 0) {
        if (command.args[0] === 'help') {
          evalCmd.help();
          return;
        }
        logger.error(`Unknown command: ${command.args[0]}. Did you mean -c ${command.args[0]}?`);
        process.exitCode = 1;
        return;
      }

      if (validatedOpts.help) {
        evalCmd.help();
        return;
      }

      if (validatedOpts.interactiveProviders) {
        const runCommand = promptfooCommand('eval');
        logger.warn(
          chalk.yellow(dedent`
          Warning: The --interactive-providers option has been removed.

          Instead, use -j 1 to run evaluations with a concurrency of 1:
          ${chalk.green(`${runCommand} -j 1`)}
        `),
        );
        process.exitCode = 2;
        return;
      }

      if (validatedOpts.remote) {
        cliState.remote = true;
      }

      for (const maybeFilePath of validatedOpts.output ?? []) {
        const extension = getOutputFileFormat(maybeFilePath);
        invariant(
          extension,
          `Unsupported output file format: ${maybeFilePath}. Please use one of: ${SUPPORTED_OUTPUT_FILE_FORMATS.join(', ')}.`,
        );
      }
      await doEval(
        validatedOpts as Partial<CommandLineOptions & Command>,
        defaultConfig,
        defaultConfigPath,
        { ...evaluateOptions, eventSource: 'cli' },
      );
    });

  return evalCmd;
}

export { EvalCommandSchema };
