import fs from 'fs';
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
import { evaluate } from '../evaluator';
import { checkEmailStatusAndMaybeExit, promptForEmailUnverified } from '../globalConfig/accounts';
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
import { CommandLineOptionsSchema, OutputFileExtension, TestSuiteSchema } from '../types/index';
import { isApiProvider } from '../types/providers';
import { checkCloudPermissions, getEvalConfigFromCloud, getOrgContext } from '../util/cloud';
import { clearConfigCache, loadDefaultConfig } from '../util/config/default';
import { DEFAULT_CONFIG_EXTENSIONS } from '../util/config/extensions';
import { resolveConfigs } from '../util/config/load';
import { maybeLoadFromExternalFile } from '../util/file';
import { printBorder, setupEnv, writeMultipleOutputs } from '../util/index';
import invariant from '../util/invariant';
import { promptfooCommand } from '../util/promptfooCommand';
import { shouldShareResults } from '../util/sharing';
import { TokenUsageTracker } from '../util/tokenUsage';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { isUuid } from '../util/uuid';
import { filterProviders } from './eval/filterProviders';
import { filterTests } from './eval/filterTests';
import { generateEvalSummary } from './eval/summary';
import { deleteErrorResults, getErrorResultIds, recalculatePromptMetrics } from './retry';
import { notCloudEnabledShareInstructions } from './share';
import type { Command } from 'commander';

import type {
  CommandLineOptions,
  EvaluateOptions,
  Scenario,
  TestSuite,
  UnifiedConfig,
} from '../types/index';
import type { FilterOptions } from './eval/filterTests';

const EvalCommandSchema = CommandLineOptionsSchema.extend({
  help: z.boolean().optional(),
  interactiveProviders: z.boolean().optional(),
  remote: z.boolean().optional(),
  noShare: z.boolean().optional(),
  retryErrors: z.boolean().optional(),
  extension: z.array(z.string()).optional(),
  // Allow --resume or --resume <id>
  resume: z.union([z.string(), z.boolean()]).optional(),
}).partial();

type EvalCommandOptions = z.infer<typeof EvalCommandSchema>;

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

// ─── Helper: reload and resolve default config ────────────────────────────────

async function reloadDefaultConfig(
  defaultConfigPath: string | undefined,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<Partial<UnifiedConfig>> {
  if (!defaultConfigPath) {
    return defaultConfig;
  }
  const configDir = path.dirname(defaultConfigPath);
  const configName = path.basename(defaultConfigPath, path.extname(defaultConfigPath));
  const { defaultConfig: newDefaultConfig } = await loadDefaultConfig(configDir, configName);
  return newDefaultConfig;
}

// ─── Helper: resolve directory config args ───────────────────────────────────

async function resolveDirectoryConfigArgs(
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<Partial<UnifiedConfig>> {
  if (cmdObj.config === undefined) {
    return defaultConfig;
  }

  const configPaths: string[] = Array.isArray(cmdObj.config) ? cmdObj.config : [cmdObj.config];
  let mergedConfig = defaultConfig;

  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath) || !fs.statSync(configPath).isDirectory()) {
      continue;
    }
    const { defaultConfig: dirConfig, defaultConfigPath: newConfigPath } =
      await loadDefaultConfig(configPath);
    if (newConfigPath) {
      cmdObj.config = (cmdObj.config as string[]).filter((p: string) => p !== configPath);
      (cmdObj.config as string[]).push(newConfigPath);
      mergedConfig = { ...mergedConfig, ...dirConfig };
    } else {
      logger.warn(
        `No configuration file found in directory: ${configPath}. Looked for promptfooconfig.{${DEFAULT_CONFIG_EXTENSIONS.join(',')}}. Run "${promptfooCommand('init')}" or pass --config path/to/promptfooconfig.yaml.`,
      );
    }
  }

  return mergedConfig;
}

// ─── Helper: validate resume/retry-errors mutual exclusion ───────────────────

function validateResumeRetryConflict(
  resumeRaw: string | boolean | undefined,
  retryErrors: boolean | undefined,
  writeEnabled: boolean | undefined,
): string | null {
  if (resumeRaw && retryErrors) {
    return 'Cannot use --resume and --retry-errors together. Please use one or the other.';
  }
  if (resumeRaw && writeEnabled === false) {
    return 'Cannot use --resume with --no-write. Resume functionality requires database persistence.';
  }
  if (retryErrors && writeEnabled === false) {
    return 'Cannot use --retry-errors with --no-write. Retry functionality requires database persistence.';
  }
  return null;
}

// ─── Helper: resolve config for resume mode ───────────────────────────────────

async function resolveResumeConfig(resumeEval: Eval): Promise<{
  config: Partial<UnifiedConfig>;
  testSuite: TestSuite;
  basePath: string | undefined;
  commandLineOptions: Record<string, any> | undefined;
}> {
  const { config, testSuite, basePath, commandLineOptions } = await resolveConfigs(
    {},
    resumeEval.config,
  );

  // Ensure prompts exactly match the previous run to preserve IDs and content
  if (Array.isArray(resumeEval.prompts) && resumeEval.prompts.length > 0) {
    testSuite.prompts = resumeEval.prompts.map(
      (p) =>
        ({
          raw: p.raw,
          label: p.label,
          config: p.config,
        }) as any,
    );
  }

  return { config, testSuite, basePath, commandLineOptions };
}

// ─── Helper: handle --resume flag ────────────────────────────────────────────

async function handleResume(resumeRaw: string | boolean): Promise<{
  resumeEval: Eval;
  config: Partial<UnifiedConfig>;
  testSuite: TestSuite;
  basePath: string | undefined;
  commandLineOptions: Record<string, any> | undefined;
} | null> {
  const resumeId = resumeRaw === true || resumeRaw === undefined ? 'latest' : (resumeRaw as string);
  const resumeEval = resumeId === 'latest' ? await Eval.latest() : await Eval.findById(resumeId);

  if (!resumeEval) {
    logger.error(`Could not find evaluation to resume: ${resumeId}`);
    process.exitCode = 1;
    return null;
  }

  logger.info(chalk.cyan(`Resuming evaluation ${resumeEval.id}...`));
  const resolved = await resolveResumeConfig(resumeEval);
  cliState.resume = true;

  return { resumeEval, ...resolved };
}

// ─── Helper: handle --retry-errors flag ──────────────────────────────────────

async function handleRetryErrors(): Promise<{
  resumeEval: Eval;
  config: Partial<UnifiedConfig>;
  testSuite: TestSuite;
  basePath: string | undefined;
  commandLineOptions: Record<string, any> | undefined;
} | null> {
  logger.info('Retrying ERROR results from latest evaluation...');

  const latestEval = await Eval.latest();
  if (!latestEval) {
    logger.error('No previous evaluation found to retry errors from');
    process.exitCode = 1;
    return null;
  }

  const errorResultIds = await getErrorResultIds(latestEval.id);
  if (errorResultIds.length === 0) {
    logger.info('No ERROR results found in the latest evaluation');
    return null;
  }

  logger.info(`Found ${errorResultIds.length} ERROR results to retry`);

  // NOTE (v0.121.0): ERROR results are deleted AFTER successful retry, not before.
  // Previously, deletion happened before evaluate(), causing data loss if retry failed.
  // Now we delete AFTER successful retry to preserve ERROR results for re-retry on failure.
  cliState._retryErrorResultIds = errorResultIds;

  logger.info(
    `Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
  );

  const resolved = await resolveResumeConfig(latestEval);
  cliState.resume = true;
  cliState.retryMode = true;

  return { resumeEval: latestEval, ...resolved };
}

// ─── Helper: resolve runtime options (repeat, cache, maxConcurrency, delay) ──

interface RuntimeOptions {
  repeat: number;
  cache: boolean | undefined;
  maxConcurrency: number;
  delay: number;
}

function resolveRuntimeOptions(
  resumeRaw: string | boolean | undefined,
  resumeEval: Eval | undefined,
  cmdObj: Partial<CommandLineOptions & Command>,
  commandLineOptions: Record<string, any> | undefined,
  evaluateOptions: EvaluateOptions,
): RuntimeOptions {
  if (resumeRaw) {
    const persisted = (resumeEval?.runtimeOptions || evaluateOptions || {}) as EvaluateOptions;
    return {
      repeat:
        Number.isSafeInteger(persisted.repeat || 0) && (persisted.repeat as number) > 0
          ? (persisted.repeat as number)
          : 1,
      cache: persisted.cache ?? true,
      maxConcurrency: (persisted.maxConcurrency as number | undefined) ?? DEFAULT_MAX_CONCURRENCY,
      delay: (persisted.delay as number | undefined) ?? 0,
    };
  }

  const iterations =
    cmdObj.repeat ?? commandLineOptions?.repeat ?? evaluateOptions.repeat ?? Number.NaN;
  return {
    repeat: Number.isSafeInteger(iterations) && iterations > 0 ? iterations : 1,
    cache: cmdObj.cache ?? commandLineOptions?.cache ?? evaluateOptions.cache ?? true,
    maxConcurrency:
      cmdObj.maxConcurrency ??
      commandLineOptions?.maxConcurrency ??
      evaluateOptions.maxConcurrency ??
      DEFAULT_MAX_CONCURRENCY,
    delay: cmdObj.delay ?? commandLineOptions?.delay ?? evaluateOptions.delay ?? 0,
  };
}

// ─── Helper: apply concurrency/delay settings to cliState ────────────────────

function applyDelayAndConcurrency(
  delay: number,
  maxConcurrency: number,
  resumeRaw: string | boolean | undefined,
  resumeEval: Eval | undefined,
  cmdObj: Partial<CommandLineOptions & Command>,
  commandLineOptions: Record<string, any> | undefined,
  evaluateOptions: EvaluateOptions,
): number {
  const explicitMaxConcurrency = resumeRaw
    ? ((resumeEval?.runtimeOptions as EvaluateOptions | undefined)?.maxConcurrency ??
      cmdObj.maxConcurrency ??
      commandLineOptions?.maxConcurrency ??
      evaluateOptions.maxConcurrency)
    : (cmdObj.maxConcurrency ??
      commandLineOptions?.maxConcurrency ??
      evaluateOptions.maxConcurrency);

  if (delay > 0) {
    cliState.maxConcurrency = 1;
    logger.info(
      `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
    );
    return 1;
  }

  if (explicitMaxConcurrency !== undefined) {
    cliState.maxConcurrency = explicitMaxConcurrency;
  }

  return maxConcurrency;
}

// ─── Helper: validate email for redteam ──────────────────────────────────────

async function validateEmailForRedteam(
  config: Partial<UnifiedConfig>,
  testSuite: TestSuite,
): Promise<void> {
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
}

// ─── Helper: apply grader and var to testSuite ────────────────────────────────

async function applyGraderAndVar(
  testSuite: TestSuite,
  cmdObj: Partial<CommandLineOptions & Command>,
): Promise<void> {
  if (cmdObj.grader) {
    if (typeof testSuite.defaultTest === 'string') {
      testSuite.defaultTest = {};
    }
    testSuite.defaultTest = testSuite.defaultTest || {};
    testSuite.defaultTest.options = testSuite.defaultTest.options || {};
    testSuite.defaultTest.options.provider = await loadApiProvider(cmdObj.grader, {
      basePath: cliState.basePath,
    });
    // Also update cliState.config so redteam providers can access the grader
    if (cliState.config) {
      if (typeof cliState.config.defaultTest === 'string') {
        cliState.config.defaultTest = {};
      }
      cliState.config.defaultTest = cliState.config.defaultTest || {};
      cliState.config.defaultTest.options = cliState.config.defaultTest.options || {};
      cliState.config.defaultTest.options.provider = testSuite.defaultTest.options.provider;
    }
  }

  if (cmdObj.var) {
    if (typeof testSuite.defaultTest === 'string') {
      testSuite.defaultTest = {};
    }
    testSuite.defaultTest = testSuite.defaultTest || {};
    testSuite.defaultTest.vars = { ...testSuite.defaultTest.vars, ...cmdObj.var };
  }
}

// ─── Helper: load external scenarios/tests ────────────────────────────────────

async function loadExternalScenariosAndTests(testSuite: TestSuite): Promise<void> {
  if (!testSuite.scenarios) {
    return;
  }
  testSuite.scenarios = (await maybeLoadFromExternalFile(testSuite.scenarios)) as Scenario[];
  testSuite.scenarios = testSuite.scenarios.flat();
  for (const scenario of testSuite.scenarios) {
    if (scenario.tests) {
      scenario.tests = await maybeLoadFromExternalFile(scenario.tests);
    }
  }
}

// ─── Helper: set up SIGINT handler for graceful pause ────────────────────────

interface AbortSetup {
  abortController: AbortController;
  cleanupHandler: () => void;
}

function setupAbortHandler(
  evaluateOptions: EvaluateOptions,
  cmdObj: Partial<CommandLineOptions & Command>,
  onPause: () => void,
): AbortSetup {
  const abortController = new AbortController();
  const previousAbortSignal = evaluateOptions.abortSignal;
  evaluateOptions.abortSignal = previousAbortSignal
    ? AbortSignal.any([previousAbortSignal, abortController.signal])
    : abortController.signal;

  let paused = false;
  let sigintHandler: NodeJS.SignalsListener | undefined;
  let forceExitTimeout: NodeJS.Timeout | undefined;

  const cleanupHandler = () => {
    if (sigintHandler) {
      process.removeListener('SIGINT', sigintHandler);
      sigintHandler = undefined;
    }
    if (forceExitTimeout) {
      clearTimeout(forceExitTimeout);
      forceExitTimeout = undefined;
    }
    // Restore original abort signal for watch mode
    evaluateOptions.abortSignal = previousAbortSignal;
  };

  // Only set up pause/resume handler when writing to database
  if (cmdObj.write !== false) {
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
      onPause();

      forceExitTimeout = setTimeout(() => {
        logger.warn('Evaluation shutdown timed out, force exiting...');
        process.exit(130);
      }, 10000).unref();
    };

    process.on('SIGINT', sigintHandler);
  }

  return { abortController, cleanupHandler };
}

// ─── Helper: post-evaluation cleanup for retry-errors ────────────────────────

async function cleanupRetryErrors(ret: Eval): Promise<void> {
  const errorResultIds = cliState._retryErrorResultIds;
  if (!errorResultIds) {
    return;
  }
  try {
    await deleteErrorResults(errorResultIds);
    await recalculatePromptMetrics(ret);
    logger.debug(`Cleaned up ${errorResultIds.length} old ERROR results after successful retry`);
  } catch (cleanupError) {
    logger.warn('Post-retry cleanup had issues. Retry results are saved.', {
      error: cleanupError,
    });
  } finally {
    delete cliState._retryErrorResultIds;
    cliState.retryMode = false;
  }
}

// ─── Helper: compute eval stats ──────────────────────────────────────────────

interface EvalStats {
  successes: number;
  failures: number;
  errors: number;
  totalTests: number;
  passRate: number;
  tokenUsage: ReturnType<typeof createEmptyTokenUsage>;
}

function computeEvalStats(evalRecord: Eval): EvalStats {
  let successes = 0;
  let failures = 0;
  let errors = 0;
  const tokenUsage = createEmptyTokenUsage();

  for (const prompt of evalRecord.prompts) {
    if (prompt.metrics?.testPassCount) {
      successes += prompt.metrics.testPassCount;
    }
    if (prompt.metrics?.testFailCount) {
      failures += prompt.metrics.testFailCount;
    }
    if (prompt.metrics?.testErrorCount) {
      errors += prompt.metrics.testErrorCount;
    }
    accumulateTokenUsage(tokenUsage, prompt.metrics?.tokenUsage);
  }

  const totalTests = successes + failures + errors;
  const passRate = (successes / totalTests) * 100;
  return { successes, failures, errors, totalTests, passRate, tokenUsage };
}

// ─── Helper: display results table ───────────────────────────────────────────

async function displayResultsTable(
  evalRecord: Eval,
  cmdObj: Partial<CommandLineOptions & Command>,
  stats: EvalStats,
): Promise<void> {
  if (cmdObj.table && getLogLevel() !== 'debug' && stats.totalTests < 500) {
    const table = await evalRecord.getTable();
    const outputTable = generateTable(table);
    logger.info('\n' + outputTable.toString());
    if (table.body.length > 25) {
      const rowsLeft = table.body.length - 25;
      logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
    }
  } else if (stats.failures !== 0) {
    logger.debug(
      `At least one evaluation failure occurred. This might be caused by the underlying call to the provider, or a test failure. Context: \n${JSON.stringify(
        evalRecord.prompts,
      )}`,
    );
  }

  if (stats.totalTests >= 500) {
    logger.info('Skipping table output because there are more than 500 tests.');
  }
}

// ─── Helper: display summary with cloud-share special case ───────────────────

function displaySummary(
  summaryLines: string[],
  cmdObj: Partial<CommandLineOptions & Command>,
  wantsToShare: boolean,
  canShareEval: boolean,
): void {
  if (cmdObj.write && wantsToShare && !canShareEval) {
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
}

// ─── Helper: execute sharing and return the URL ───────────────────────────────

async function executeShare(
  sharePromise: Promise<string | null>,
  evalRecord: Eval,
): Promise<string | null> {
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
      const shareableUrl = await sharePromise;
      if (shareableUrl) {
        evalRecord.shared = true;
        spinner.succeed(shareableUrl);
        return shareableUrl;
      }
      spinner.fail(chalk.red('Share failed'));
      return null;
    } catch (error) {
      spinner.fail(chalk.red('Share failed'));
      logger.debug(`Share error: ${error}`);
      return null;
    }
  }

  // CI mode
  try {
    const shareableUrl = await sharePromise;
    if (shareableUrl) {
      evalRecord.shared = true;
      logger.info(`${chalk.dim('»')} ${chalk.green('✓')} ${shareableUrl}`);
      return shareableUrl;
    }
  } catch (error) {
    logger.debug(`Share error: ${error}`);
  }
  return null;
}

// ─── Helper: build the watched file list for watch mode ──────────────────────

function buildWatchPaths(
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfigPath: string | undefined,
  config: Partial<UnifiedConfig>,
): string[] | null {
  const configPaths = (cmdObj.config || [defaultConfigPath]).filter(Boolean) as string[];
  if (!configPaths.length) {
    logger.error(
      `Could not locate config file(s) to watch. Pass --config path/to/promptfooconfig.yaml or run from a directory containing promptfooconfig.{${DEFAULT_CONFIG_EXTENSIONS.join(
        ',',
      )}}.`,
    );
    process.exitCode = 1;
    return null;
  }

  const basePath = path.dirname(configPaths[0]);

  const promptPaths = Array.isArray(config.prompts)
    ? (config.prompts
        .map((p) => {
          if (typeof p === 'string' && p.startsWith('file://')) {
            return path.resolve(basePath, p.slice('file://'.length));
          }
          if (typeof p === 'object' && p.id && p.id.startsWith('file://')) {
            return path.resolve(basePath, p.id.slice('file://'.length));
          }
          return null;
        })
        .filter(Boolean) as string[])
    : [];

  const providerPaths = Array.isArray(config.providers)
    ? (config.providers
        .map((p) =>
          typeof p === 'string' && p.startsWith('file://')
            ? path.resolve(basePath, p.slice('file://'.length))
            : null,
        )
        .filter(Boolean) as string[])
    : [];

  const varPaths = Array.isArray(config.tests)
    ? config.tests
        .flatMap((t) => {
          if (typeof t === 'string' && t.startsWith('file://')) {
            return path.resolve(basePath, t.slice('file://'.length));
          }
          if (typeof t !== 'string' && 'vars' in t && t.vars) {
            return Object.values(t.vars).flatMap((v) => {
              if (typeof v === 'string' && v.startsWith('file://')) {
                return path.resolve(basePath, v.slice('file://'.length));
              }
              return [];
            });
          }
          return [];
        })
        .filter(Boolean)
    : [];

  return Array.from(new Set([...configPaths, ...promptPaths, ...providerPaths, ...varPaths]));
}

// ─── Helper: set up file watcher for watch mode ───────────────────────────────

function setupWatcher(watchPaths: string[], onFileChange: () => Promise<void>): void {
  const watcher = chokidar.watch(watchPaths, { ignored: /^\./, persistent: true });

  watcher
    .on('change', async (changedPath) => {
      printBorder();
      logger.info(`File change detected: ${changedPath}`);
      printBorder();
      clearConfigCache();
      await onFileChange();
    })
    .on('error', (error) => logger.error(`Watcher error: ${error}`))
    .on('ready', () =>
      watchPaths.forEach((watchPath) =>
        logger.info(`Watching for file changes on ${watchPath} ...`),
      ),
    );
}

// ─── Helper: handle pass rate threshold check ─────────────────────────────────

function checkPassRateThreshold(passRate: number): void {
  const passRateThreshold = getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD', 100);
  const failedTestExitCode = getEnvInt('PROMPTFOO_FAILED_TEST_EXIT_CODE', 100);

  if (passRate >= (Number.isFinite(passRateThreshold) ? passRateThreshold : 100)) {
    return;
  }

  if (getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD') !== undefined) {
    logger.info(
      chalk.white(
        `Pass rate ${chalk.red.bold(passRate.toFixed(2))}${chalk.red('%')} is below the threshold of ${chalk.red.bold(passRateThreshold)}${chalk.red('%')}`,
      ),
    );
  }
  process.exitCode = Number.isSafeInteger(failedTestExitCode) ? failedTestExitCode : 100;
}

// ─── Helper: clean up provider WebSocket connections ─────────────────────────

async function cleanupProviders(testSuite: TestSuite): Promise<void> {
  if (testSuite.providers.length === 0) {
    return;
  }
  for (const provider of testSuite.providers) {
    if (isApiProvider(provider)) {
      const cleanup = provider?.cleanup?.();
      if (cleanup instanceof Promise) {
        await cleanup;
      }
    }
  }
}

// ─── Helper: resolve run config (resume / retry-errors / normal) ─────────────

interface ResolvedConfigResult {
  resumeEval: Eval | undefined;
  config: Partial<UnifiedConfig>;
  testSuite: TestSuite;
  basePath: string | undefined;
  commandLineOptions: Record<string, any> | undefined;
}

async function resolveRunConfig(
  resumeRaw: string | boolean | undefined,
  retryErrors: boolean | undefined,
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<ResolvedConfigResult | { earlyReturn: Eval }> {
  if (resumeRaw) {
    const result = await handleResume(resumeRaw);
    if (!result) {
      return { earlyReturn: new Eval({}, { persisted: false }) };
    }
    return result;
  }

  if (retryErrors) {
    const result = await handleRetryErrors();
    if (!result) {
      const latestEval = await Eval.latest();
      return { earlyReturn: latestEval ?? new Eval({}, { persisted: false }) };
    }
    return result;
  }

  const { config, testSuite, basePath, commandLineOptions } = await resolveConfigs(
    cmdObj,
    defaultConfig,
  );
  return { resumeEval: undefined, config, testSuite, basePath, commandLineOptions };
}

// ─── Helper: resolve progress bar setting ────────────────────────────────────

function resolveShowProgressBar(
  cmdObj: Partial<CommandLineOptions & Command>,
  evaluateOptions: EvaluateOptions,
): boolean {
  if (getLogLevel() === 'debug') {
    return false;
  }
  if (cmdObj.progressBar !== undefined) {
    return cmdObj.progressBar !== false;
  }
  if (evaluateOptions.showProgressBar !== undefined) {
    return evaluateOptions.showProgressBar;
  }
  return true;
}

// ─── Helper: maybe emit redteam telemetry ────────────────────────────────────

function maybeRecordRedteamExampleTelemetry(config: Partial<UnifiedConfig>): void {
  if (
    !config.redteam ||
    !Array.isArray(config.providers) ||
    config.providers.length === 0 ||
    typeof config.providers[0] !== 'object' ||
    config.providers[0].id !== 'http'
  ) {
    return;
  }
  const maybeUrl: unknown = (config.providers[0] as any)?.config?.url;
  if (typeof maybeUrl === 'string' && maybeUrl.includes('promptfoo.app')) {
    telemetry.record('feature_used', { feature: 'redteam_run_with_example' });
  }
}

// ─── Helper: warn if redteam config has no test cases ────────────────────────

function warnIfRedteamHasNoTests(config: Partial<UnifiedConfig>, testSuite: TestSuite): void {
  if (
    !config.redteam ||
    (testSuite.tests && testSuite.tests.length > 0) ||
    (testSuite.scenarios && testSuite.scenarios.length > 0)
  ) {
    return;
  }
  logger.warn(
    chalk.yellow(dedent`
    Warning: Config file has a redteam section but no test cases.
    Did you mean to run ${chalk.bold('promptfoo redteam generate')} instead?
    `),
  );
}

// ─── Helper: prepare test suite (filters, email, grader, scenarios, schema) ──

async function prepareTestSuite(
  testSuite: TestSuite,
  config: Partial<UnifiedConfig>,
  resumeEval: Eval | undefined,
  cmdObj: Partial<CommandLineOptions & Command>,
  commandLineOptions: Record<string, any> | undefined,
  options: EvaluateOptions,
): Promise<void> {
  if (!resumeEval) {
    const filterOptions: FilterOptions = {
      failing: cmdObj.filterFailing,
      failingOnly: cmdObj.filterFailingOnly,
      errorsOnly: cmdObj.filterErrorsOnly,
      firstN: cmdObj.filterFirstN,
      metadata: cmdObj.filterMetadata,
      pattern: cmdObj.filterPattern,
      sample: cmdObj.filterSample,
    };
    testSuite.tests = await filterTests(testSuite, filterOptions);
  }

  await validateEmailForRedteam(config, testSuite);

  if (!resumeEval) {
    testSuite.providers = filterProviders(
      testSuite.providers,
      cmdObj.filterProviders || cmdObj.filterTargets,
    );
  }

  await checkCloudPermissions(config as UnifiedConfig);

  if (!resumeEval) {
    await applyGraderAndVar(testSuite, cmdObj);
    if (cmdObj.generateSuggestions ?? commandLineOptions?.generateSuggestions) {
      options.generateSuggestions = true;
    }
  }

  await loadExternalScenariosAndTests(testSuite);

  const testSuiteSchema = TestSuiteSchema.safeParse(testSuite);
  if (!testSuiteSchema.success) {
    logger.warn(
      chalk.yellow(dedent`
    TestSuite Schema Validation Error:

      ${z.prettifyError(testSuiteSchema.error)}

    Please review your promptfooconfig.yaml configuration.`),
    );
  }
}

// ─── Helper: run evaluate() and handle retry cleanup ─────────────────────────

async function runAndHandlePause(
  testSuite: TestSuite,
  evalRecord: Eval,
  options: EvaluateOptions,
  config: Partial<UnifiedConfig>,
  evaluateOptions: EvaluateOptions,
  retryErrors: boolean | undefined,
  cmdObj: Partial<CommandLineOptions & Command>,
): Promise<{ ret: Eval; paused: boolean }> {
  let paused = false;
  const { cleanupHandler } = setupAbortHandler(evaluateOptions, cmdObj, () => {
    paused = true;
  });

  let ret: Eval;
  try {
    ret = await evaluate(testSuite, evalRecord, {
      ...options,
      eventSource: 'cli',
      abortSignal: evaluateOptions.abortSignal,
      isRedteam: Boolean(config.redteam),
    });

    if (retryErrors && cliState._retryErrorResultIds && !paused) {
      await cleanupRetryErrors(ret);
    }
  } finally {
    cleanupHandler();
  }

  return { ret, paused };
}

// ─── Helper: report results after evaluation ─────────────────────────────────

async function reportResults(
  evalRecord: Eval,
  config: Partial<UnifiedConfig>,
  cmdObj: Partial<CommandLineOptions & Command>,
  commandLineOptions: Record<string, any> | undefined,
  maxConcurrency: number,
  startTime: number,
  initialization: boolean | undefined,
  defaultConfigPath: string | undefined,
  runAgain: () => Promise<void>,
): Promise<void> {
  evalRecord.clearResults();

  const wantsToShare = shouldShareResults({
    cliShare: cmdObj.share,
    cliNoShare: cmdObj.noShare,
    configShare: commandLineOptions?.share,
    configSharing: config.sharing,
  });
  const hasExplicitDisable =
    cmdObj.share === false || cmdObj.noShare === true || getEnvBool('PROMPTFOO_DISABLE_SHARING');
  const canShareEval = isSharingEnabled(evalRecord);

  logger.debug(`Wants to share: ${wantsToShare}`);
  logger.debug(`Can share eval: ${canShareEval}`);

  const willShare = wantsToShare && canShareEval;
  const sharePromise: Promise<string | null> | null = willShare
    ? createShareableUrl(evalRecord, { silent: true })
    : null;

  const stats = computeEvalStats(evalRecord);
  await displayResultsTable(evalRecord, cmdObj, stats);

  const { outputPath } = config;
  const paths = (Array.isArray(outputPath) ? outputPath : [outputPath]).filter(
    (p): p is string => typeof p === 'string' && p.length > 0 && !p.endsWith('.jsonl'),
  );

  const isRedteam = Boolean(config.redteam);
  const duration = Math.round((Date.now() - startTime) / 1000);
  const tracker = TokenUsageTracker.getInstance();

  const summaryLines = generateEvalSummary({
    evalId: evalRecord.id,
    isRedteam,
    writeToDatabase: cmdObj.write !== false,
    shareableUrl: null,
    wantsToShare,
    hasExplicitDisable,
    cloudEnabled: cloudConfig.isEnabled(),
    activelySharing: willShare,
    tokenUsage: stats.tokenUsage,
    successes: stats.successes,
    failures: stats.failures,
    errors: stats.errors,
    duration,
    maxConcurrency,
    tracker,
  });

  displaySummary(summaryLines, cmdObj, wantsToShare, canShareEval);

  let shareableUrl: string | null = null;
  if (sharePromise != null) {
    shareableUrl = await executeShare(sharePromise, evalRecord);
  }

  logger.debug(`Shareable URL: ${shareableUrl}`);

  if (paths.length) {
    await writeMultipleOutputs(paths, evalRecord, shareableUrl);
    logger.info(chalk.yellow(`Writing output to ${paths.join(', ')}`));
  }

  telemetry.record('command_used', {
    name: 'eval',
    watch: Boolean(cmdObj.watch),
    duration,
    isRedteam,
  });

  if (cmdObj.watch) {
    if (initialization) {
      const watchPaths = buildWatchPaths(cmdObj, defaultConfigPath, config);
      if (watchPaths) {
        setupWatcher(watchPaths, runAgain);
      }
    }
    return;
  }

  checkPassRateThreshold(stats.passRate);
}

// ─── Core evaluation iteration (extracted from the runEvaluation closure) ─────

interface EvaluationIterationContext {
  initialization: boolean | undefined;
  cmdObj: Partial<CommandLineOptions & Command>;
  defaultConfig: () => Partial<UnifiedConfig>;
  setDefaultConfig: (c: Partial<UnifiedConfig>) => void;
  defaultConfigPath: () => string | undefined;
  evaluateOptions: () => EvaluateOptions;
  setEvaluateOptions: (o: EvaluateOptions) => void;
  getConfig: () => Partial<UnifiedConfig> | undefined;
  setConfig: (c: Partial<UnifiedConfig>) => void;
  getTestSuite: () => TestSuite | undefined;
  setTestSuite: (ts: TestSuite) => void;
  setBasePath: (bp: string | undefined) => void;
  getCommandLineOptions: () => Record<string, any> | undefined;
  setCommandLineOptions: (clo: Record<string, any> | undefined) => void;
  runEvaluation: () => Promise<void>;
}

async function runEvaluationIteration(ctx: EvaluationIterationContext): Promise<Eval> {
  const { initialization, cmdObj } = ctx;
  const startTime = Date.now();

  telemetry.record('command_used', {
    name: 'eval - started',
    watch: Boolean(cmdObj.watch),
    ...(Boolean(ctx.getConfig()?.redteam) && { isRedteam: true }),
  });

  if (cmdObj.write) {
    await runDbMigrations();
  }

  ctx.setDefaultConfig(await reloadDefaultConfig(ctx.defaultConfigPath(), ctx.defaultConfig()));
  ctx.setDefaultConfig(await resolveDirectoryConfigArgs(cmdObj, ctx.defaultConfig()));

  const resumeRaw = (cmdObj as any).resume as string | boolean | undefined;
  const retryErrors = cmdObj.retryErrors;

  const conflictError = validateResumeRetryConflict(resumeRaw, retryErrors, cmdObj.write);
  if (conflictError) {
    logger.error(chalk.red(conflictError));
    process.exitCode = 1;
    return new Eval({}, { persisted: false });
  }

  const resolved = await resolveRunConfig(resumeRaw, retryErrors, cmdObj, ctx.defaultConfig());
  if ('earlyReturn' in resolved) {
    return resolved.earlyReturn;
  }

  const { resumeEval } = resolved;
  ctx.setConfig(resolved.config);
  ctx.setTestSuite(resolved.testSuite);
  ctx.setBasePath(resolved.basePath);
  ctx.setCommandLineOptions(resolved.commandLineOptions);

  const config = ctx.getConfig()!;
  const testSuite = ctx.getTestSuite()!;
  const commandLineOptions = ctx.getCommandLineOptions();

  if (!cmdObj.envPath && commandLineOptions?.envPath) {
    logger.debug(`Loading additional environment from config: ${commandLineOptions.envPath}`);
    setupEnv(commandLineOptions.envPath);
  }

  warnIfRedteamHasNoTests(config, testSuite);
  maybeRecordRedteamExampleTelemetry(config);

  if (config.evaluateOptions) {
    ctx.setEvaluateOptions({ ...ctx.evaluateOptions(), ...config.evaluateOptions });
  }

  const runtimeOpts = resolveRuntimeOptions(
    resumeRaw,
    resumeEval,
    cmdObj,
    commandLineOptions,
    ctx.evaluateOptions(),
  );
  const { repeat, cache, delay } = runtimeOpts;
  let { maxConcurrency } = runtimeOpts;

  if (cache === false || repeat > 1) {
    logger.info('Cache is disabled.');
    disableCache();
  }

  maxConcurrency = applyDelayAndConcurrency(
    delay,
    maxConcurrency,
    resumeRaw,
    resumeEval,
    cmdObj,
    commandLineOptions,
    ctx.evaluateOptions(),
  );

  const options: EvaluateOptions = {
    ...ctx.evaluateOptions(),
    showProgressBar: resolveShowProgressBar(cmdObj, ctx.evaluateOptions()),
    repeat,
    delay: !Number.isNaN(delay) && delay > 0 ? delay : undefined,
    maxConcurrency,
    cache,
  };

  await prepareTestSuite(testSuite, config, resumeEval, cmdObj, commandLineOptions, options);

  const evalRecord = resumeEval
    ? resumeEval
    : cmdObj.write
      ? await Eval.create(config, testSuite.prompts, { runtimeOptions: options })
      : new Eval(config, { runtimeOptions: options });

  const { ret, paused } = await runAndHandlePause(
    testSuite,
    evalRecord,
    options,
    config,
    ctx.evaluateOptions(),
    retryErrors,
    cmdObj,
  );

  cliState.resume = false;

  if (paused && cmdObj.write !== false) {
    printBorder();
    logger.info(`${chalk.yellow('⏸')} Evaluation paused. ID: ${chalk.cyan(evalRecord.id)}`);
    logger.info(`» Resume with: ${chalk.green.bold('promptfoo eval --resume ' + evalRecord.id)}`);
    printBorder();
    return ret;
  }

  await reportResults(
    evalRecord,
    config,
    cmdObj,
    commandLineOptions,
    maxConcurrency,
    startTime,
    initialization,
    ctx.defaultConfigPath(),
    ctx.runEvaluation,
  );

  if (testSuite.redteam) {
    showRedteamProviderLabelMissingWarning(testSuite);
  }

  await cleanupProviders(testSuite);

  return ret;
}

// ─── Main evaluation function ─────────────────────────────────────────────────

export async function doEval(
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
  evaluateOptions: EvaluateOptions,
): Promise<Eval> {
  // Phase 1: Load environment from CLI args (preserves existing behavior)
  setupEnv(cmdObj.envPath);

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

  const runEvaluation = async (initialization?: boolean): Promise<Eval> => {
    return runEvaluationIteration({
      initialization,
      cmdObj,
      defaultConfig: () => defaultConfig,
      setDefaultConfig: (c) => {
        defaultConfig = c;
      },
      defaultConfigPath: () => defaultConfigPath,
      evaluateOptions: () => evaluateOptions,
      setEvaluateOptions: (o) => {
        evaluateOptions = o;
      },
      getConfig: () => config,
      setConfig: (c) => {
        config = c;
      },
      getTestSuite: () => testSuite,
      setTestSuite: (ts) => {
        testSuite = ts;
      },
      setBasePath: (bp) => {
        _basePath = bp;
      },
      getCommandLineOptions: () => commandLineOptions,
      setCommandLineOptions: (clo) => {
        commandLineOptions = clo;
      },
      runEvaluation: async () => {
        await runEvaluation();
      },
    });
  };

  return await runEvaluation(true /* initialization */);
}

export function evalCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
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
      'Path to output file (csv, txt, json, yaml, yml, html), default is no output file',
    )
    .option('--table', 'Output table in CLI', defaultConfig?.commandLineOptions?.table ?? true)
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option(
      '--table-cell-max-length <number>',
      'Truncate console table cells to this length',
      '250',
    )
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
      'Generate N new prompts and append them to the prompt list',
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
        logger.warn(`Unknown command: ${command.args[0]}. Did you mean -c ${command.args[0]}?`);
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
        const { data: extension } = OutputFileExtension.safeParse(
          maybeFilePath.split('.').pop()?.toLowerCase(),
        );
        invariant(
          extension,
          `Unsupported output file format: ${maybeFilePath}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
        );
      }
      await doEval(
        validatedOpts as Partial<CommandLineOptions & Command>,
        defaultConfig,
        defaultConfigPath,
        evaluateOptions,
      );
    });

  return evalCmd;
}

export { EvalCommandSchema };
