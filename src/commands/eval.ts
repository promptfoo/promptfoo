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
import { checkCloudPermissions, getOrgContext } from '../util/cloud';
import { clearConfigCache, loadDefaultConfig } from '../util/config/default';
import { resolveConfigs } from '../util/config/load';
import { maybeLoadFromExternalFile } from '../util/file';
import { printBorder, setupEnv, writeMultipleOutputs } from '../util/index';
import invariant from '../util/invariant';
import { promptfooCommand } from '../util/promptfooCommand';
import { shouldShareResults } from '../util/sharing';
import { TokenUsageTracker } from '../util/tokenUsage';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';
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

    // Reload default config - because it may have changed.
    if (defaultConfigPath) {
      const configDir = path.dirname(defaultConfigPath);
      const configName = path.basename(defaultConfigPath, path.extname(defaultConfigPath));
      const { defaultConfig: newDefaultConfig } = await loadDefaultConfig(configDir, configName);
      defaultConfig = newDefaultConfig;
    }

    if (cmdObj.config !== undefined) {
      const configPaths: string[] = Array.isArray(cmdObj.config) ? cmdObj.config : [cmdObj.config];
      for (const configPath of configPaths) {
        if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
          const { defaultConfig: dirConfig, defaultConfigPath: newConfigPath } =
            await loadDefaultConfig(configPath);
          if (newConfigPath) {
            cmdObj.config = cmdObj.config.filter((path: string) => path !== configPath);
            cmdObj.config.push(newConfigPath);
            defaultConfig = { ...defaultConfig, ...dirConfig };
          } else {
            logger.warn(`No configuration file found in directory: ${configPath}`);
          }
        }
      }
    }

    // Check for conflicting options
    const resumeRaw = (cmdObj as any).resume as string | boolean | undefined;
    const retryErrors = cmdObj.retryErrors;

    if (resumeRaw && retryErrors) {
      logger.error(
        chalk.red('Cannot use --resume and --retry-errors together. Please use one or the other.'),
      );
      process.exitCode = 1;
      return new Eval({}, { persisted: false });
    }

    // If resuming, load config from existing eval and avoid CLI filters that could change indices
    let resumeEval: Eval | undefined;
    const resumeId =
      resumeRaw === true || resumeRaw === undefined ? 'latest' : (resumeRaw as string);
    if (resumeRaw) {
      // Check if --no-write is set with --resume
      if (cmdObj.write === false) {
        logger.error(
          chalk.red(
            'Cannot use --resume with --no-write. Resume functionality requires database persistence.',
          ),
        );
        process.exitCode = 1;
        return new Eval({}, { persisted: false });
      }
      resumeEval = resumeId === 'latest' ? await Eval.latest() : await Eval.findById(resumeId);
      if (!resumeEval) {
        logger.error(`Could not find evaluation to resume: ${resumeId}`);
        process.exitCode = 1;
        return new Eval({}, { persisted: false });
      }
      logger.info(chalk.cyan(`Resuming evaluation ${resumeEval.id}...`));
      // Use the saved config as our base to ensure identical test ordering
      ({
        config,
        testSuite,
        basePath: _basePath,
        commandLineOptions,
      } = await resolveConfigs({}, resumeEval.config));
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
      // Mark resume mode in CLI state so evaluator can skip completed work
      cliState.resume = true;
    } else if (retryErrors) {
      // Check if --no-write is set with --retry-errors
      if (cmdObj.write === false) {
        logger.error(
          chalk.red(
            'Cannot use --retry-errors with --no-write. Retry functionality requires database persistence.',
          ),
        );
        process.exitCode = 1;
        return new Eval({}, { persisted: false });
      }

      logger.info('🔄 Retrying ERROR results from latest evaluation...');

      // Find the latest evaluation
      const latestEval = await Eval.latest();
      if (!latestEval) {
        logger.error('No previous evaluation found to retry errors from');
        process.exitCode = 1;
        return new Eval({}, { persisted: false });
      }

      // Get all ERROR result IDs - capture BEFORE retry so we know what to delete on success
      const errorResultIds = await getErrorResultIds(latestEval.id);
      if (errorResultIds.length === 0) {
        logger.info('✅ No ERROR results found in the latest evaluation');
        return latestEval;
      }

      logger.info(`Found ${errorResultIds.length} ERROR results to retry`);

      // NOTE (v0.121.0): ERROR results are deleted AFTER successful retry, not before.
      // Previously, deletion happened before evaluate(), causing data loss if retry failed.
      // Now we delete AFTER successful retry to preserve ERROR results for re-retry on failure.
      // Store errorResultIds for post-evaluation cleanup
      cliState._retryErrorResultIds = errorResultIds;

      logger.info(
        `🔄 Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
      );

      // Set up for resume mode
      resumeEval = latestEval;

      // Use the saved config as our base to ensure identical test ordering
      ({
        config,
        testSuite,
        basePath: _basePath,
        commandLineOptions,
      } = await resolveConfigs({}, resumeEval.config));

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

      // Mark resume mode in CLI state so evaluator can skip completed work
      // Enable retry mode so getCompletedIndexPairs excludes ERROR results
      cliState.resume = true;
      cliState.retryMode = true;
    } else {
      ({
        config,
        testSuite,
        basePath: _basePath,
        commandLineOptions,
      } = await resolveConfigs(cmdObj, defaultConfig));
    }

    // Phase 2: Load environment from config files if not already set via CLI
    if (!cmdObj.envPath && commandLineOptions?.envPath) {
      logger.debug(`Loading additional environment from config: ${commandLineOptions.envPath}`);
      setupEnv(commandLineOptions.envPath);
    }

    // Check if config has redteam section but no test cases
    if (
      config.redteam &&
      (!testSuite.tests || testSuite.tests.length === 0) &&
      (!testSuite.scenarios || testSuite.scenarios.length === 0)
    ) {
      logger.warn(
        chalk.yellow(dedent`
        Warning: Config file has a redteam section but no test cases.
        Did you mean to run ${chalk.bold('promptfoo redteam generate')} instead?
        `),
      );
    }

    // TODO(faizan): Crazy condition to see when we run the example redteam config.
    // Remove this once we have a better way to track this.
    if (
      config.redteam &&
      Array.isArray(config.providers) &&
      config.providers.length > 0 &&
      typeof config.providers[0] === 'object' &&
      config.providers[0].id === 'http'
    ) {
      const maybeUrl: unknown = (config.providers[0] as any)?.config?.url;
      if (typeof maybeUrl === 'string' && maybeUrl.includes('promptfoo.app')) {
        telemetry.record('feature_used', {
          feature: 'redteam_run_with_example',
        });
      }
    }

    // Ensure evaluateOptions from the config file are applied
    if (config.evaluateOptions) {
      evaluateOptions = {
        ...evaluateOptions,
        ...config.evaluateOptions,
      };
    }

    // Resolve runtime options. If resuming, prefer persisted options stored with the eval.
    let repeat: number;
    let cache: boolean | undefined;
    let maxConcurrency: number;
    let delay: number;
    if (resumeRaw) {
      const persisted = (resumeEval?.runtimeOptions ||
        config.evaluateOptions ||
        {}) as EvaluateOptions;
      repeat =
        Number.isSafeInteger(persisted.repeat || 0) && (persisted.repeat as number) > 0
          ? (persisted.repeat as number)
          : 1;
      cache = persisted.cache ?? true;
      maxConcurrency = (persisted.maxConcurrency as number | undefined) ?? DEFAULT_MAX_CONCURRENCY;
      delay = (persisted.delay as number | undefined) ?? 0;
    } else {
      // Misc settings with proper CLI vs config priority
      // CLI values explicitly provided by user should override config, but defaults should not
      const iterations =
        cmdObj.repeat ?? commandLineOptions?.repeat ?? evaluateOptions.repeat ?? Number.NaN;
      repeat = Number.isSafeInteger(iterations) && iterations > 0 ? iterations : 1;
      cache = cmdObj.cache ?? commandLineOptions?.cache ?? evaluateOptions.cache ?? true;
      maxConcurrency =
        cmdObj.maxConcurrency ??
        commandLineOptions?.maxConcurrency ??
        evaluateOptions.maxConcurrency ??
        DEFAULT_MAX_CONCURRENCY;
      delay = cmdObj.delay ?? commandLineOptions?.delay ?? evaluateOptions.delay ?? 0;
    }

    if (cache === false || repeat > 1) {
      logger.info('Cache is disabled.');
      disableCache();
    }

    // Propagate maxConcurrency to cliState for providers (e.g., Python worker pool)
    // Check if maxConcurrency was explicitly set (not using DEFAULT_MAX_CONCURRENCY)
    // For resume mode, include persisted value as "explicit", with fallback to config when
    // runtimeOptions are missing (e.g., older evals that didn't persist runtimeOptions)
    const explicitMaxConcurrency = resumeRaw
      ? ((resumeEval?.runtimeOptions as EvaluateOptions | undefined)?.maxConcurrency ??
        cmdObj.maxConcurrency ??
        commandLineOptions?.maxConcurrency ??
        evaluateOptions.maxConcurrency)
      : (cmdObj.maxConcurrency ??
        commandLineOptions?.maxConcurrency ??
        evaluateOptions.maxConcurrency);

    if (delay > 0) {
      maxConcurrency = 1;
      // Also limit Python workers to 1 when delay is set (no point having more workers than concurrency)
      cliState.maxConcurrency = 1;
      logger.info(
        `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
      );
    } else if (explicitMaxConcurrency !== undefined) {
      cliState.maxConcurrency = explicitMaxConcurrency;
    }

    // Apply filtering only when not resuming, to preserve test indices
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

    if (
      !neverGenerateRemote() &&
      config.redteam &&
      config.redteam.plugins &&
      config.redteam.plugins.length > 0 &&
      testSuite.tests &&
      testSuite.tests.length > 0
    ) {
      let hasValidEmail = false;
      while (!hasValidEmail) {
        const { emailNeedsValidation } = await promptForEmailUnverified();
        const res = await checkEmailStatusAndMaybeExit({ validate: emailNeedsValidation });
        hasValidEmail = res === EMAIL_OK_STATUS;
      }
    }

    if (!resumeEval) {
      testSuite.providers = filterProviders(
        testSuite.providers,
        cmdObj.filterProviders || cmdObj.filterTargets,
      );
    }

    await checkCloudPermissions(config as UnifiedConfig);

    const options: EvaluateOptions = {
      ...evaluateOptions,
      showProgressBar:
        getLogLevel() === 'debug'
          ? false
          : cmdObj.progressBar !== undefined
            ? cmdObj.progressBar !== false
            : evaluateOptions.showProgressBar !== undefined
              ? evaluateOptions.showProgressBar
              : true,
      repeat,
      delay: !Number.isNaN(delay) && delay > 0 ? delay : undefined,
      maxConcurrency,
      cache,
      // CLI --reporter flag overrides config file reporters
      reporters: cmdObj.reporter ?? evaluateOptions.reporters,
    };

    if (!resumeEval && cmdObj.grader) {
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
        // Normalize string shorthand to object
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
    if (!resumeEval && (cmdObj.generateSuggestions ?? commandLineOptions?.generateSuggestions)) {
      options.generateSuggestions = true;
    }
    // load scenarios or tests from an external file
    if (testSuite.scenarios) {
      testSuite.scenarios = (await maybeLoadFromExternalFile(testSuite.scenarios)) as Scenario[];
      // Flatten the scenarios array in case glob patterns were used
      testSuite.scenarios = testSuite.scenarios.flat();
    }
    for (const scenario of testSuite.scenarios || []) {
      if (scenario.tests) {
        scenario.tests = await maybeLoadFromExternalFile(scenario.tests);
      }
    }

    const testSuiteSchema = TestSuiteSchema.safeParse(testSuite);
    if (!testSuiteSchema.success) {
      logger.warn(
        chalk.yellow(dedent`
      TestSuite Schema Validation Error:

        ${z.prettifyError(testSuiteSchema.error)}

      Please review your promptfooconfig.yaml configuration.`),
      );
    }

    // Create or load eval record
    const evalRecord = resumeEval
      ? resumeEval
      : cmdObj.write
        ? await Eval.create(config, testSuite.prompts, { runtimeOptions: options })
        : new Eval(config, { runtimeOptions: options });

    // Graceful pause support via Ctrl+C (only when writing to database)
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
        // Atomic check-and-set to handle rapid successive SIGINTs safely
        const wasPaused = paused;
        paused = true;

        if (wasPaused) {
          // Second Ctrl+C: immediate force exit
          // Clear the timeout to avoid resource leak
          if (forceExitTimeout) {
            clearTimeout(forceExitTimeout);
            forceExitTimeout = undefined;
          }
          // Skip closeDbIfOpen() - it could block on WAL checkpoint, defeating the escape hatch
          // Database will recover on next run via WAL replay
          logger.warn('Force exiting...');
          process.exit(130);
        }

        logger.info(chalk.yellow('Pausing evaluation... Press Ctrl+C again to force exit.'));
        abortController.abort();

        // Set a timeout for force exit if evaluate() hangs after abort signal
        // Note: This covers the evaluation phase only. Shutdown (telemetry/logger)
        // is covered by main.ts signal handling.
        forceExitTimeout = setTimeout(() => {
          // Skip closeDbIfOpen() - could block, defeating the timeout
          logger.warn('Evaluation shutdown timed out, force exiting...');
          process.exit(130);
        }, 10000).unref();
      };

      // Use process.on instead of process.once to handle second Ctrl+C
      process.on('SIGINT', sigintHandler);
    }

    // Run the evaluation!!!!!!
    let ret;
    try {
      ret = await evaluate(testSuite, evalRecord, {
        ...options,
        eventSource: 'cli',
        abortSignal: evaluateOptions.abortSignal,
        isRedteam: Boolean(config.redteam),
      });

      // Post-evaluation cleanup for retry-errors mode
      // SUCCESS: Now it's safe to delete the old ERROR results and recalculate metrics
      // Skip if evaluation was paused - no point cleaning up incomplete retry
      if (retryErrors && cliState._retryErrorResultIds && !paused) {
        const errorResultIds = cliState._retryErrorResultIds;
        try {
          await deleteErrorResults(errorResultIds);
          await recalculatePromptMetrics(ret);
          logger.debug(
            `Cleaned up ${errorResultIds.length} old ERROR results after successful retry`,
          );
        } catch (cleanupError) {
          // Cleanup failure is non-fatal - retry itself succeeded
          logger.warn('Post-retry cleanup had issues. Retry results are saved.', {
            error: cleanupError,
          });
        } finally {
          // Clear the stored error result IDs
          delete cliState._retryErrorResultIds;
          // Clear retry mode flags
          cliState.retryMode = false;
        }
      }
    } finally {
      cleanupHandler(); // Always cleanup, even if evaluate() throws
    }

    // Clear resume flag after run completes
    cliState.resume = false;

    // If paused, print minimal guidance and skip the rest of the reporting
    if (paused && cmdObj.write !== false) {
      printBorder();
      logger.info(`${chalk.yellow('⏸')} Evaluation paused. ID: ${chalk.cyan(evalRecord.id)}`);
      logger.info(`» Resume with: ${chalk.green.bold('promptfoo eval --resume ' + evalRecord.id)}`);
      printBorder();
      return ret;
    }

    // Clear results from memory to avoid memory issues
    evalRecord.clearResults();

    // Determine sharing using shared utility (DRY - same logic as retry command)
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

    // Start sharing in background (don't await yet) - this allows us to show results immediately
    const willShare = wantsToShare && canShareEval;
    let sharePromise: Promise<string | null> | null = null;
    if (willShare) {
      // Start the share operation in background with silent mode (no progress bar)
      sharePromise = createShareableUrl(evalRecord, { silent: true });
    }

    let successes = 0;
    let failures = 0;
    let errors = 0;
    const tokenUsage = createEmptyTokenUsage();

    // Calculate our total successes and failures
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

    // Output results table immediately (before share completes)
    if (cmdObj.table && getLogLevel() !== 'debug' && totalTests < 500) {
      const table = await evalRecord.getTable();
      // Output CLI table
      const outputTable = generateTable(table);

      logger.info('\n' + outputTable.toString());
      if (table.body.length > 25) {
        const rowsLeft = table.body.length - 25;
        logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
      }
    } else if (failures !== 0) {
      logger.debug(
        `At least one evaluation failure occurred. This might be caused by the underlying call to the provider, or a test failure. Context: \n${JSON.stringify(
          evalRecord.prompts,
        )}`,
      );
    }

    if (totalTests >= 500) {
      logger.info('Skipping table output because there are more than 500 tests.');
    }

    const { outputPath } = config;

    // We're removing JSONL from paths since we already wrote to that during the evaluation
    const paths = (Array.isArray(outputPath) ? outputPath : [outputPath]).filter(
      (p): p is string => typeof p === 'string' && p.length > 0 && !p.endsWith('.jsonl'),
    );

    const isRedteam = Boolean(config.redteam);
    const duration = Math.round((Date.now() - startTime) / 1000);
    const tracker = TokenUsageTracker.getInstance();

    // Generate and display summary immediately (before share completes)
    const summaryLines = generateEvalSummary({
      evalId: evalRecord.id,
      isRedteam,
      writeToDatabase: cmdObj.write !== false,
      shareableUrl: null, // Not available yet if sharing in background
      wantsToShare,
      hasExplicitDisable,
      cloudEnabled: cloudConfig.isEnabled(),
      activelySharing: willShare,
      tokenUsage,
      successes,
      failures,
      errors,
      duration,
      maxConcurrency,
      tracker,
    });

    // Special case: show cloud signup instructions when user wants to share but can't
    if (cmdObj.write && wantsToShare && !canShareEval) {
      logger.info(summaryLines[0]); // Show just the completion message
      notCloudEnabledShareInstructions();
      // Skip the guidance lines and show the rest
      for (let i = 1; i < summaryLines.length; i++) {
        if (summaryLines[i].includes('View results:')) {
          // Skip guidance section
          while (i < summaryLines.length && !summaryLines[i].includes('Total Tokens:')) {
            i++;
          }
          i--; // Back up one so the for loop increment works
        } else {
          logger.info(summaryLines[i]);
        }
      }
    } else {
      // Normal case: show all summary lines
      for (const line of summaryLines) {
        logger.info(line);
      }
    }

    // Now wait for share to complete and show spinner (as the last output)
    let shareableUrl: string | null = null;
    if (sharePromise != null) {
      // Determine org context for spinner text
      const orgContext = await getOrgContext();
      const orgSuffix = orgContext
        ? ` to ${orgContext.organizationName}${orgContext.teamName ? ` > ${orgContext.teamName}` : ''}`
        : '';

      // Only show spinner in TTY (not CI)
      if (process.stdout.isTTY && !isCI()) {
        const spinner = ora({
          text: `Sharing${orgSuffix}...`,
          prefixText: chalk.dim('»'),
          spinner: 'dots',
        }).start();

        try {
          shareableUrl = await sharePromise;
          if (shareableUrl) {
            evalRecord.shared = true;
            spinner.succeed(shareableUrl);
          } else {
            spinner.fail(chalk.red('Share failed'));
          }
        } catch (error) {
          spinner.fail(chalk.red('Share failed'));
          logger.debug(`Share error: ${error}`);
        }
      } else {
        // CI mode - just await and log result
        try {
          shareableUrl = await sharePromise;
          if (shareableUrl) {
            evalRecord.shared = true;
            logger.info(`${chalk.dim('»')} ${chalk.green('✓')} ${shareableUrl}`);
          }
        } catch (error) {
          logger.debug(`Share error: ${error}`);
        }
      }
    }

    logger.debug(`Shareable URL: ${shareableUrl}`);

    // Write outputs after share completes (so we can include shareableUrl)
    if (paths.length) {
      await writeMultipleOutputs(paths, evalRecord, shareableUrl);
      logger.info(chalk.yellow(`Writing output to ${paths.join(', ')}`));
    }

    telemetry.record('command_used', {
      name: 'eval',
      watch: Boolean(cmdObj.watch),
      duration: Math.round((Date.now() - startTime) / 1000),
      isRedteam,
    });

    if (cmdObj.watch && !resumeEval) {
      if (initialization) {
        const configPaths = (cmdObj.config || [defaultConfigPath]).filter(Boolean) as string[];
        if (!configPaths.length) {
          logger.error('Could not locate config file(s) to watch');
          process.exitCode = 1;
          return ret;
        }
        const basePath = path.dirname(configPaths[0]);
        const promptPaths = Array.isArray(config.prompts)
          ? (config.prompts
              .map((p) => {
                if (typeof p === 'string' && p.startsWith('file://')) {
                  return path.resolve(basePath, p.slice('file://'.length));
                } else if (typeof p === 'object' && p.id && p.id.startsWith('file://')) {
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
                } else if (typeof t !== 'string' && 'vars' in t && t.vars) {
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
        const watchPaths = Array.from(
          new Set([...configPaths, ...promptPaths, ...providerPaths, ...varPaths]),
        );
        const watcher = chokidar.watch(watchPaths, { ignored: /^\./, persistent: true });

        watcher
          .on('change', async (path) => {
            printBorder();
            logger.info(`File change detected: ${path}`);
            printBorder();
            clearConfigCache();
            await runEvaluation();
          })
          .on('error', (error) => logger.error(`Watcher error: ${error}`))
          .on('ready', () =>
            watchPaths.forEach((watchPath) =>
              logger.info(`Watching for file changes on ${watchPath} ...`),
            ),
          );
      }
    } else {
      const passRateThreshold = getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD', 100);
      const failedTestExitCode = getEnvInt('PROMPTFOO_FAILED_TEST_EXIT_CODE', 100);

      if (passRate < (Number.isFinite(passRateThreshold) ? passRateThreshold : 100)) {
        if (getEnvFloat('PROMPTFOO_PASS_RATE_THRESHOLD') !== undefined) {
          logger.info(
            chalk.white(
              `Pass rate ${chalk.red.bold(passRate.toFixed(2))}${chalk.red('%')} is below the threshold of ${chalk.red.bold(passRateThreshold)}${chalk.red('%')}`,
            ),
          );
        }
        process.exitCode = Number.isSafeInteger(failedTestExitCode) ? failedTestExitCode : 100;
        return ret;
      }
    }
    if (testSuite.redteam) {
      showRedteamProviderLabelMissingWarning(testSuite);
    }

    // Clean up any WebSocket connections
    if (testSuite.providers.length > 0) {
      for (const provider of testSuite.providers) {
        if (isApiProvider(provider)) {
          const cleanup = provider?.cleanup?.();
          if (cleanup instanceof Promise) {
            await cleanup;
          }
        }
      }
    }

    return ret;
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
      'Path to configuration file. Automatically loads promptfooconfig.yaml',
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
    .option(
      '--reporter <reporters...>',
      'Reporter(s) to use for output (default, silent, summary, or file://path)',
    )
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
