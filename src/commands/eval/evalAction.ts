import chalk from 'chalk';
import chokidar from 'chokidar';
import type { Command } from 'commander';
import dedent from 'dedent';
import fs from 'fs';
import * as path from 'path';
import { fromError } from 'zod-validation-error';
import { disableCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import { DEFAULT_MAX_CONCURRENCY, evaluate } from '../../evaluator';
import { checkEmailStatusOrExit, promptForEmailUnverified } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger, { getLogLevel } from '../../logger';
import { runDbMigrations } from '../../migrate';
import Eval from '../../models/eval';
import { loadApiProvider } from '../../providers';
import { createShareableUrl, isSharingEnabled } from '../../share';
import { generateTable } from '../../table';
import telemetry from '../../telemetry';
import type {
  CommandLineOptions,
  EvaluateOptions,
  Scenario,
  TestSuite,
  TokenUsage,
  UnifiedConfig,
} from '../../types';
import { TestSuiteSchema } from '../../types';
import { isApiProvider } from '../../types/providers';
import { printBorder, setupEnv, writeMultipleOutputs } from '../../util';
import { clearConfigCache, loadDefaultConfig } from '../../util/config/default';
import { resolveConfigs } from '../../util/config/load';
import { maybeLoadFromExternalFile } from '../../util/file';
import { formatDuration } from '../../util/formatDuration';
import { TokenUsageTracker } from '../../util/tokenUsage';
import { filterProviders } from './filterProviders';
import type { FilterOptions } from './filterTests';
import { filterTests } from './filterTests';
import { notCloudEnabledShareInstructions } from '../share';

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

/**
 * Format token usage for display in CLI output
 */
export function formatTokenUsage(usage: Partial<TokenUsage>): string {
  const parts = [];

  if (usage.total !== undefined) {
    parts.push(`${usage.total.toLocaleString()} total`);
  }

  if (usage.prompt !== undefined) {
    parts.push(`${usage.prompt.toLocaleString()} prompt`);
  }

  if (usage.completion !== undefined) {
    parts.push(`${usage.completion.toLocaleString()} completion`);
  }

  if (usage.cached !== undefined) {
    parts.push(`${usage.cached.toLocaleString()} cached`);
  }

  if (usage.completionDetails?.reasoning !== undefined) {
    parts.push(`${usage.completionDetails.reasoning.toLocaleString()} reasoning`);
  }

  return parts.join(' / ');
}

export async function doEval(
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
  evaluateOptions: EvaluateOptions,
): Promise<Eval> {
  setupEnv(cmdObj.envPath);

  let config: Partial<UnifiedConfig> | undefined = undefined;
  let testSuite: TestSuite | undefined = undefined;

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

    // Misc settings
    const iterations = cmdObj.repeat ?? Number.NaN;
    const repeat = Number.isSafeInteger(cmdObj.repeat) && iterations > 0 ? iterations : 1;

    if (!cmdObj.cache || repeat > 1) {
      logger.info('Cache is disabled.');
      disableCache();
    }

    ({ config, testSuite } = await resolveConfigs(cmdObj, defaultConfig));

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
      config.providers[0].id === 'http' &&
      config.providers[0].config.url.includes('promptfoo.app')
    ) {
      telemetry.record('feature_used', {
        feature: 'redteam_run_with_example',
      });
    }

    // Ensure evaluateOptions from the config file are applied
    if (config.evaluateOptions) {
      evaluateOptions = {
        ...config.evaluateOptions,
        ...evaluateOptions,
      };
    }

    let maxConcurrency =
      cmdObj.maxConcurrency ?? evaluateOptions.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const delay = cmdObj.delay ?? 0;

    if (delay > 0) {
      maxConcurrency = 1;
      logger.info(
        `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
      );
    }

    const filterOptions: FilterOptions = {
      failing: cmdObj.filterFailing,
      errorsOnly: cmdObj.filterErrorsOnly,
      firstN: cmdObj.filterFirstN,
      metadata: cmdObj.filterMetadata,
      pattern: cmdObj.filterPattern,
      sample: cmdObj.filterSample,
    };

    testSuite.tests = await filterTests(testSuite, filterOptions);

    if (
      config.redteam &&
      config.redteam.plugins &&
      config.redteam.plugins.length > 0 &&
      testSuite.tests &&
      testSuite.tests.length > 0
    ) {
      await promptForEmailUnverified();
      await checkEmailStatusOrExit();
    }

    testSuite.providers = filterProviders(
      testSuite.providers,
      cmdObj.filterProviders || cmdObj.filterTargets,
    );

    const options: EvaluateOptions = {
      ...evaluateOptions,
      showProgressBar: getLogLevel() === 'debug' ? false : cmdObj.progressBar,
      repeat,
      delay: !Number.isNaN(delay) && delay > 0 ? delay : undefined,
      maxConcurrency,
    };

    if (cmdObj.grader) {
      if (typeof testSuite.defaultTest === 'string') {
        testSuite.defaultTest = {};
      }
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.options = testSuite.defaultTest.options || {};
      testSuite.defaultTest.options.provider = await loadApiProvider(cmdObj.grader);
    }
    if (cmdObj.var) {
      if (typeof testSuite.defaultTest === 'string') {
        testSuite.defaultTest = {};
      }
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.vars = { ...testSuite.defaultTest.vars, ...cmdObj.var };
    }
    if (cmdObj.generateSuggestions) {
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
      const validationError = fromError(testSuiteSchema.error);
      logger.warn(
        chalk.yellow(dedent`
      TestSuite Schema Validation Error:

        ${validationError.toString()}

      Please review your promptfooconfig.yaml configuration.`),
      );
    }

    const evalRecord = cmdObj.write
      ? await Eval.create(config, testSuite.prompts)
      : new Eval(config);

    // Run the evaluation!!!!!!
    const ret = await evaluate(testSuite, evalRecord, {
      ...options,
      eventSource: 'cli',
      abortSignal: evaluateOptions.abortSignal,
      isRedteam: Boolean(config.redteam),
    });

    // Clear results from memory to avoid memory issues
    evalRecord.clearResults();

    const wantsToShare = cmdObj.share && config.sharing;

    const shareableUrl =
      wantsToShare && isSharingEnabled(evalRecord) ? await createShareableUrl(evalRecord) : null;

    let successes = 0;
    let failures = 0;
    let errors = 0;
    const tokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };

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
      tokenUsage.total += prompt.metrics?.tokenUsage?.total || 0;
      tokenUsage.prompt += prompt.metrics?.tokenUsage?.prompt || 0;
      tokenUsage.completion += prompt.metrics?.tokenUsage?.completion || 0;
      tokenUsage.cached += prompt.metrics?.tokenUsage?.cached || 0;
      tokenUsage.numRequests += prompt.metrics?.tokenUsage?.numRequests || 0;
      if (prompt.metrics?.tokenUsage?.completionDetails) {
        tokenUsage.completionDetails.reasoning +=
          prompt.metrics.tokenUsage.completionDetails.reasoning || 0;
        tokenUsage.completionDetails.acceptedPrediction +=
          prompt.metrics.tokenUsage.completionDetails.acceptedPrediction || 0;
        tokenUsage.completionDetails.rejectedPrediction +=
          prompt.metrics.tokenUsage.completionDetails.rejectedPrediction || 0;
      }
      if (prompt.metrics?.tokenUsage?.assertions) {
        tokenUsage.assertions.total += prompt.metrics.tokenUsage.assertions.total || 0;
        tokenUsage.assertions.prompt += prompt.metrics.tokenUsage.assertions.prompt || 0;
        tokenUsage.assertions.completion += prompt.metrics.tokenUsage.assertions.completion || 0;
        tokenUsage.assertions.cached += prompt.metrics.tokenUsage.assertions.cached || 0;

        if (prompt.metrics.tokenUsage.assertions.completionDetails) {
          tokenUsage.assertions.completionDetails.reasoning +=
            prompt.metrics.tokenUsage.assertions.completionDetails.reasoning || 0;
          tokenUsage.assertions.completionDetails.acceptedPrediction +=
            prompt.metrics.tokenUsage.assertions.completionDetails.acceptedPrediction || 0;
          tokenUsage.assertions.completionDetails.rejectedPrediction +=
            prompt.metrics.tokenUsage.assertions.completionDetails.rejectedPrediction || 0;
        }
      }
    }
    const totalTests = successes + failures + errors;
    const passRate = (successes / totalTests) * 100;

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
    if (paths.length) {
      await writeMultipleOutputs(paths, evalRecord, shareableUrl);
      logger.info(chalk.yellow(`Writing output to ${paths.join(', ')}`));
    }

    printBorder();
    if (cmdObj.write) {
      if (shareableUrl) {
        logger.info(`${chalk.green('✔')} Evaluation complete: ${shareableUrl}`);
      } else if (wantsToShare && !isSharingEnabled(evalRecord)) {
        notCloudEnabledShareInstructions();
      } else {
        logger.info(`${chalk.green('✔')} Evaluation complete. ID: ${chalk.cyan(evalRecord.id)}\n`);
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

    // Format and display duration
    const duration = Math.round((Date.now() - startTime) / 1000);
    const durationDisplay = formatDuration(duration);

    const isRedteam = Boolean(config.redteam);

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
      logger.info(`    ${chalk.gray('Total:')} ${chalk.white(evalTokens.total.toLocaleString())}`);
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
      if (evalTokens.completionDetails.reasoning > 0) {
        logger.info(
          `    ${chalk.gray('Reasoning:')} ${chalk.white(evalTokens.completionDetails.reasoning.toLocaleString())}`,
        );
      }

      // Provider breakdown
      const tracker = TokenUsageTracker.getInstance();
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
              `    ${chalk.gray(displayId + ':')} ${chalk.white(displayTotal.toLocaleString())}`,
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
      if (tokenUsage.assertions.total > 0) {
        logger.info(`\n  ${chalk.magenta.bold('Grading:')}`);
        logger.info(
          `    ${chalk.gray('Total:')} ${chalk.white(tokenUsage.assertions.total.toLocaleString())}`,
        );
        logger.info(
          `    ${chalk.gray('Prompt:')} ${chalk.white(tokenUsage.assertions.prompt.toLocaleString())}`,
        );
        logger.info(
          `    ${chalk.gray('Completion:')} ${chalk.white(tokenUsage.assertions.completion.toLocaleString())}`,
        );
        if (tokenUsage.assertions.cached > 0) {
          logger.info(
            `    ${chalk.gray('Cached:')} ${chalk.green(tokenUsage.assertions.cached.toLocaleString())}`,
          );
        }
        if (tokenUsage.assertions.completionDetails?.reasoning > 0) {
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

    telemetry.record('command_used', {
      name: 'eval',
      watch: Boolean(cmdObj.watch),
      duration: Math.round((Date.now() - startTime) / 1000),
      isRedteam,
    });

    if (cmdObj.watch) {
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