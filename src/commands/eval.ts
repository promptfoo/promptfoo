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
import { shouldUseInkUI } from '../ui/interactiveCheck';
import { checkCloudPermissions, getOrgContext } from '../util/cloud';
import { clearConfigCache, loadDefaultConfig } from '../util/config/default';
import { resolveConfigs } from '../util/config/load';
import { maybeLoadFromExternalFile } from '../util/file';
import { formatDuration } from '../util/formatDuration';
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
  interactive: z.boolean().optional(),
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
      // Check if Ink UI will be used (to suppress logger output that interferes with Ink)
      const willUseInkUIResume = cmdObj.interactive !== false && shouldUseInkUI();
      if (!willUseInkUIResume) {
        logger.info(chalk.cyan(`Resuming evaluation ${resumeEval.id}...`));
      }
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

      // Check if Ink UI will be used (to suppress logger output that interferes with Ink)
      const willUseInkUIRetry = cmdObj.interactive !== false && shouldUseInkUI();
      if (!willUseInkUIRetry) {
        logger.info('🔄 Retrying ERROR results from latest evaluation...');
      }

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
        if (!willUseInkUIRetry) {
          logger.info('✅ No ERROR results found in the latest evaluation');
        }
        return latestEval;
      }

      if (!willUseInkUIRetry) {
        logger.info(`Found ${errorResultIds.length} ERROR results to retry`);
      }

      // NOTE (v0.121.0): ERROR results are deleted AFTER successful retry, not before.
      // Previously, deletion happened before evaluate(), causing data loss if retry failed.
      // Now we delete AFTER successful retry to preserve ERROR results for re-retry on failure.
      // Store errorResultIds for post-evaluation cleanup
      cliState._retryErrorResultIds = errorResultIds;

      if (!willUseInkUIRetry) {
        logger.info(
          `🔄 Running evaluation with resume mode to retry ${errorResultIds.length} test cases...`,
        );
      }

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

    // Check if Ink UI will be used (to suppress logger output that interferes with Ink)
    const willUseInkUI = cmdObj.interactive !== false && shouldUseInkUI();

    if (cache === false || repeat > 1) {
      if (!willUseInkUI) {
        logger.info('Cache is disabled.');
      }
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
      if (!willUseInkUI) {
        logger.info(
          `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
        );
      }
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

    // Determine Ink UI mode early — needed before pause handler setup.
    // Use Ink UI only when opt-in via env var (and --no-interactive is not specified)
    const useInkUI = cmdObj.interactive !== false && shouldUseInkUI();

    // Only set up pause/resume handler when writing to database AND not using Ink UI.
    // Ink mode handles SIGINT via render.ts signal handlers → onCancel callback.
    // Installing a second SIGINT handler here would conflict.
    if (cmdObj.write !== false && !useInkUI) {
      sigintHandler = () => {
        // Atomic check-and-set to handle rapid successive SIGINTs safely
        const wasPaused = paused;
        paused = true;

        if (wasPaused) {
          // Second Ctrl+C: remove our handler so the NEXT signal goes through
          // Node's default handler (which terminates with exit code 130).
          // The force-exit timeout is already ticking from the first Ctrl+C.
          logger.warn('Press Ctrl+C once more to force exit.');
          process.exitCode = 130;
          cleanupHandler();
          return;
        }

        logger.info(chalk.yellow('Pausing evaluation... Press Ctrl+C again to force exit.'));
        abortController.abort();

        // Set a timeout for force exit if evaluate() hangs after abort signal.
        // This is the last-resort escape when the evaluator won't honor the abort.
        // process.exit() is intentional: the evaluator is stuck and won't return,
        // so finally-block cleanup (shutdownGracefully) can't run either way.
        forceExitTimeout = setTimeout(() => {
          logger.warn('Evaluation shutdown timed out, force exiting...');
          process.exitCode = 130;
          process.exit();
        }, 10000).unref();
      };

      // Use process.on instead of process.once to handle second Ctrl+C
      process.on('SIGINT', sigintHandler);
    }

    // Run the evaluation!!!!!!
    let ret!: Eval;

    // Track pending share for display after table (shared across Ink UI and table display)
    let pendingInkShare: Promise<string | null> | null = null;
    let inkUISucceeded = false;

    if (useInkUI) {
      try {
        // Use Ink-based interactive UI
        logger.debug('Using Ink UI for evaluation');
        cliState.inkUI = true;

        // Determine if sharing is enabled and fetch org context if so
        // Must use the same precedence logic as the actual sharing decision
        let shareContext: { organizationName: string; teamName?: string } | null = null;
        const willShare = shouldShareResults({
          cliShare: cmdObj.share,
          cliNoShare: cmdObj.noShare,
          configShare: commandLineOptions?.share,
          configSharing: config.sharing,
        });
        if (willShare && isSharingEnabled(evalRecord)) {
          shareContext = await getOrgContext();
        }

        // Create abort controller for user cancellation via 'q' key
        const inkAbortController = new AbortController();

        // Dynamic import: evalRunner.tsx uses JSX which compiles to a static jsx-runtime import.
        // Loading it lazily ensures React/Ink are only pulled in when Ink UI is actually used.
        const { initInkEval } = await import('../ui/evalRunner');
        const inkResult = await initInkEval({
          title: config.description || 'Evaluation',
          evaluateOptions: {
            ...options,
            // Disable CLI progress bar - Ink UI has its own progress display
            showProgressBar: false,
            eventSource: 'cli',
            // Combine any existing abort signal with our UI abort controller
            abortSignal: evaluateOptions.abortSignal
              ? AbortSignal.any([evaluateOptions.abortSignal, inkAbortController.signal])
              : inkAbortController.signal,
            isRedteam: Boolean(config.redteam),
          },
          testSuite,
          shareContext,
          onCancel: () => {
            logger.debug('Evaluation cancelled by user - aborting');
            inkAbortController.abort();
            // Also abort the main controller so the fallback evaluate path (line ~752)
            // sees an aborted signal and doesn't re-run the evaluation.
            abortController.abort();
          },
        });

        try {
          // Initialize UI with total tests and providers
          // Total test results = tests × prompts (each provider runs all combinations)
          const numTests = testSuite.tests?.length ?? 0;
          const numPrompts = testSuite.prompts?.length ?? 1;
          const totalTestsPerProvider = numTests * numPrompts;
          const providerIds = testSuite.providers.map((p) =>
            typeof p === 'string' ? p : p.label || p.id?.() || 'unknown',
          );
          inkResult.controller.init(totalTestsPerProvider, providerIds, maxConcurrency);
          inkResult.controller.start();

          // Run evaluation with Ink progress callback
          ret = await evaluate(testSuite, evalRecord, inkResult.evaluateOptions);

          // Mark success immediately after evaluate() returns to prevent double-evaluation in catch block
          inkUISucceeded = true;

          // If cancelled (SIGINT or 'q' key), Ink is unmounted — skip all post-eval UI updates.
          // The finally block handles cleanup; the early-return after the Ink block handles exit.
          if (inkAbortController.signal.aborted) {
            logger.debug('Evaluation was cancelled — skipping post-eval UI updates');
          } else {
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

            // Get final stats
            const results = await evalRecord.getResults();
            const passed = results.filter((r) => r.success).length;
            const failed = results.filter((r) => !r.success && !r.error).length;
            const errors = results.filter((r) => r.error).length;

            inkResult.controller.complete({ passed, failed, errors });

            // willShare was already calculated with full precedence logic before initInkEval
            const canShareInk = isSharingEnabled(evalRecord);

            logger.debug(`Ink UI - Wants to share: ${willShare}, Can share: ${canShareInk}`);

            // Start sharing in background (non-blocking)
            if (willShare && canShareInk) {
              // Update UI to show sharing in progress
              inkResult.controller.setSharingStatus('sharing');

              // Start sharing in background - don't await
              pendingInkShare = createShareableUrl(evalRecord, false, { silent: true });

              // Handle share completion asynchronously - updates UI while table is visible
              pendingInkShare
                .then((url) => {
                  if (url) {
                    inkResult.controller.setSharingStatus('completed', url);
                    evalRecord.shared = true;
                  } else {
                    inkResult.controller.setSharingStatus('failed');
                  }
                })
                .catch((err) => {
                  logger.debug(`Share failed: ${err}`);
                  inkResult.controller.setSharingStatus('failed');
                });
            }

            // Brief pause to show completion state
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Transition to results table within the same Ink session
            // Virtual scrolling handles large tables efficiently (only renders ~25 rows at a time)
            // The 10,000 row limit is a safety bound for extremely large evals
            if (cmdObj.table && getLogLevel() !== 'debug') {
              const table = await evalRecord.getTable();
              if (table.body.length < 10000) {
                inkResult.controller.showResults(table);
                // Wait for user to exit the results table
                await inkResult.renderResult.waitUntilExit();
              }
            }
          }
        } finally {
          inkResult.cleanup();
          cliState.inkUI = false;
          // Clean up SIGINT handler (matches non-Ink path behavior at line 753)
          cleanupHandler();
        }

        // pendingInkShare (if started) is resolved via the unified share path below
      } catch (inkError) {
        // Fall back to standard CLI output if Ink UI fails
        logger.warn(
          `Interactive UI failed, falling back to standard output: ${inkError instanceof Error ? inkError.message : inkError}`,
        );
        cliState.inkUI = false;
      }
    }

    if (!inkUISucceeded && !abortController.signal.aborted) {
      // Use standard CLI output (either Ink UI not enabled or failed).
      // Skip if abort was triggered (e.g., user cancelled in Ink mode) — don't re-evaluate.
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
    }

    // Clear resume flag after run completes
    cliState.resume = false;

    // If evaluation was aborted (user cancellation in Ink mode, or signal during fallback),
    // skip reporting — ret may be unassigned and the process is about to exit.
    if (abortController.signal.aborted) {
      return ret;
    }

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

    // Unify share promise: use Ink's background share if it was already started,
    // otherwise start a new one. This ensures shareableUrl is available for file exports.
    const willShare = wantsToShare && canShareEval && !evalRecord.shared;
    let sharePromise: Promise<string | null> | null = pendingInkShare ?? null;
    if (willShare && !sharePromise) {
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

    // Display results table (non-Ink UI mode only - Ink UI handles table in unified session above)
    // Output results immediately (before share completes)
    if (!inkUISucceeded && cmdObj.table && getLogLevel() !== 'debug' && totalTests < 500) {
      const table = await evalRecord.getTable();
      const outputTable = generateTable(table);
      logger.info('\n' + outputTable.toString());
      if (table.body.length > 25) {
        const rowsLeft = table.body.length - 25;
        logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
      }
    } else if (failures !== 0 && !inkUISucceeded) {
      logger.debug(
        `At least one evaluation failure occurred. This might be caused by the underlying call to the provider, or a test failure. Context: \n${JSON.stringify(
          evalRecord.prompts,
        )}`,
      );
    }

    if (totalTests >= 500 && !inkUISucceeded) {
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

    // Generate and display text summary (non-Ink mode only — Ink UI has its own completion display)
    if (!inkUISucceeded) {
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
    }

    // Wait for share to complete. In Ink mode the share was already tracked in the UI,
    // so we just silently resolve the URL for file exports. In non-Ink mode, show a spinner.
    let shareableUrl: string | null = null;
    if (sharePromise != null) {
      if (inkUISucceeded) {
        // Ink mode: silently resolve (share progress was shown in the Ink UI)
        try {
          shareableUrl = await sharePromise;
          if (shareableUrl) {
            evalRecord.shared = true;
          }
        } catch (error) {
          logger.debug(`Share error: ${error}`);
        }
      } else {
        // Non-Ink mode: show spinner or CI-style output
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
    }

    logger.debug(`Shareable URL: ${shareableUrl}`);

    // Write outputs after share completes (so we can include shareableUrl)
    if (paths.length) {
      await writeMultipleOutputs(paths, evalRecord, shareableUrl);
      if (!inkUISucceeded) {
        logger.info(chalk.yellow(`Writing output to ${paths.join(', ')}`));
      }
    }

    // Skip banner output in Ink UI mode - already shown in the interactive UI
    if (!inkUISucceeded) {
      printBorder();
      if (cmdObj.write) {
        if (shareableUrl) {
          logger.info(`${chalk.green('✔')} Evaluation complete: ${shareableUrl}`);
        } else if (wantsToShare && !isSharingEnabled(evalRecord)) {
          notCloudEnabledShareInstructions();
        } else {
          logger.info(
            `${chalk.green('✔')} Evaluation complete. ID: ${chalk.cyan(evalRecord.id)}\n`,
          );
          logger.info(
            `» Run ${chalk.greenBright.bold('promptfoo view')} to use the local web viewer`,
          );
          if (cloudConfig.isEnabled()) {
            logger.info(
              `» Run ${chalk.greenBright.bold('promptfoo share')} to create a shareable URL`,
            );
          } else {
            logger.info(
              `» Do you want to share this with your team? Sign up for free at ${chalk.greenBright.bold('https://promptfoo.app')}`,
            );
          }

          logger.info(
            `» This project needs your feedback. What's one thing we can improve? ${chalk.greenBright.bold(
              'https://promptfoo.dev/feedback',
            )}`,
          );
        }
      } else {
        logger.info(`${chalk.green('✔')} Evaluation complete`);
      }

      printBorder();
    }

    // Skip token usage and final stats in Ink UI mode - already shown in the interactive UI
    if (!inkUISucceeded) {
      const durationDisplay = formatDuration(duration);
      // Handle token usage display
      if (tokenUsage.total > 0 || (tokenUsage.prompt || 0) + (tokenUsage.completion || 0) > 0) {
        const combinedTotal = (tokenUsage.prompt || 0) + (tokenUsage.completion || 0);
        const evalTokens = {
          prompt: tokenUsage.prompt || 0,
          completion: tokenUsage.completion || 0,
          total: tokenUsage.total || combinedTotal,
          cached: tokenUsage.cached || 0,
          completionDetails: tokenUsage.completionDetails || {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        };

        logger.info(chalk.bold('Token Usage Summary:'));

        if (isRedteam) {
          logger.info(
            `  ${chalk.cyan('Probes:')} ${chalk.white.bold(tokenUsage.numRequests.toLocaleString())}`,
          );
        }

        // Eval tokens
        logger.info(`\n  ${chalk.yellow.bold('Evaluation:')}`);
        logger.info(
          `    ${chalk.gray('Total:')} ${chalk.white(evalTokens.total.toLocaleString())}`,
        );
        logger.info(
          `    ${chalk.gray('Prompt:')} ${chalk.white(evalTokens.prompt.toLocaleString())}`,
        );
        logger.info(
          `    ${chalk.gray('Completion:')} ${chalk.white(evalTokens.completion.toLocaleString())}`,
        );
        if (evalTokens.cached > 0) {
          logger.info(
            `    ${chalk.gray('Cached:')} ${chalk.green(evalTokens.cached.toLocaleString())}`,
          );
        }
        if (evalTokens.completionDetails?.reasoning && evalTokens.completionDetails.reasoning > 0) {
          logger.info(
            `    ${chalk.gray('Reasoning:')} ${chalk.white(evalTokens.completionDetails.reasoning.toLocaleString())}`,
          );
        }

        // Provider breakdown

        const providerIds = tracker.getProviderIds();
        if (providerIds.length > 1) {
          logger.info(`\n  ${chalk.cyan.bold('Provider Breakdown:')}`);

          // Sort providers by total token usage (descending)
          const sortedProviders = providerIds
            .map((id) => ({ id, usage: tracker.getProviderUsage(id)! }))
            .sort((a, b) => (b.usage.total || 0) - (a.usage.total || 0));

          for (const { id, usage } of sortedProviders) {
            if ((usage.total || 0) > 0 || (usage.prompt || 0) + (usage.completion || 0) > 0) {
              const displayTotal = usage.total || (usage.prompt || 0) + (usage.completion || 0);
              // Extract just the provider ID part (remove class name in parentheses)
              const displayId = id.includes(' (') ? id.substring(0, id.indexOf(' (')) : id;
              logger.info(
                `    ${chalk.gray(displayId + ':')} ${chalk.white(displayTotal.toLocaleString())} (${usage.numRequests} requests)`,
              );

              // Show breakdown if there are individual components
              if (usage.prompt || usage.completion || usage.cached) {
                const details = [];
                if (usage.prompt) {
                  details.push(`${usage.prompt.toLocaleString()} prompt`);
                }
                if (usage.completion) {
                  details.push(`${usage.completion.toLocaleString()} completion`);
                }
                if (usage.cached) {
                  details.push(`${usage.cached.toLocaleString()} cached`);
                }
                if (usage.completionDetails?.reasoning) {
                  details.push(`${usage.completionDetails.reasoning.toLocaleString()} reasoning`);
                }
                if (details.length > 0) {
                  logger.info(`      ${chalk.dim('(' + details.join(', ') + ')')}`);
                }
              }
            }
          }
        }

        // Grading tokens
        if (
          tokenUsage.assertions &&
          tokenUsage.assertions.total &&
          tokenUsage.assertions.total > 0
        ) {
          logger.info(`\n  ${chalk.magenta.bold('Grading:')}`);
          logger.info(
            `    ${chalk.gray('Total:')} ${chalk.white(tokenUsage.assertions.total.toLocaleString())}`,
          );
          if (tokenUsage.assertions.prompt) {
            logger.info(
              `    ${chalk.gray('Prompt:')} ${chalk.white(tokenUsage.assertions.prompt.toLocaleString())}`,
            );
          }
          if (tokenUsage.assertions.completion) {
            logger.info(
              `    ${chalk.gray('Completion:')} ${chalk.white(tokenUsage.assertions.completion.toLocaleString())}`,
            );
          }
          if (tokenUsage.assertions.cached && tokenUsage.assertions.cached > 0) {
            logger.info(
              `    ${chalk.gray('Cached:')} ${chalk.green(tokenUsage.assertions.cached.toLocaleString())}`,
            );
          }
          if (
            tokenUsage.assertions.completionDetails?.reasoning &&
            tokenUsage.assertions.completionDetails.reasoning > 0
          ) {
            logger.info(
              `    ${chalk.gray('Reasoning:')} ${chalk.white(tokenUsage.assertions.completionDetails.reasoning.toLocaleString())}`,
            );
          }
        }

        // Grand total
        const grandTotal = evalTokens.total + (tokenUsage.assertions.total || 0);
        logger.info(
          `\n  ${chalk.blue.bold('Grand Total:')} ${chalk.white.bold(grandTotal.toLocaleString())} tokens`,
        );
        printBorder();
      }

      logger.info(chalk.gray(`Duration: ${durationDisplay} (concurrency: ${maxConcurrency})`));
      logger.info(chalk.green.bold(`Successes: ${successes}`));
      logger.info(chalk.red.bold(`Failures: ${failures}`));
      if (!Number.isNaN(errors)) {
        logger.info(chalk.red.bold(`Errors: ${errors}`));
      }
      if (!Number.isNaN(passRate)) {
        logger.info(chalk.blue.bold(`Pass Rate: ${passRate.toFixed(2)}%`));
      }
      printBorder();
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
      (val) => Number.parseInt(val, 10),
    )
    .option('--repeat <number>', 'Number of times to run each test (default: 1)', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay between each test (in milliseconds) (default: 0)', (val) =>
      Number.parseInt(val, 10),
    )
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
    .option('--no-interactive', 'Disable interactive UI (use standard CLI output)')
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
