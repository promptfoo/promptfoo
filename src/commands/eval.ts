import chalk from 'chalk';
import chokidar from 'chokidar';
import type { Command } from 'commander';
import dedent from 'dedent';
import * as path from 'path';
import invariant from 'tiny-invariant';
import { disableCache } from '../cache';
import cliState from '../cliState';
import { resolveConfigs } from '../config';
import { getEnvFloat, getEnvInt, getEnvBool } from '../envars';
import { DEFAULT_MAX_CONCURRENCY, evaluate } from '../evaluator';
import logger, { getLogLevel, setLogLevel } from '../logger';
import { loadApiProvider } from '../providers';
import { createShareableUrl } from '../share';
import { generateTable } from '../table';
import telemetry from '../telemetry';
import type {
  CommandLineOptions,
  EvaluateOptions,
  Scenario,
  TestSuite,
  UnifiedConfig,
} from '../types';
import { OutputFileExtension, TestSuiteSchema } from '../types';
import { maybeLoadFromExternalFile } from '../util';
import {
  migrateResultsFromFileSystemToDatabase,
  printBorder,
  setupEnv,
  writeMultipleOutputs,
  writeOutput,
  writeResultsToDatabase,
} from '../util';
import { filterProviders } from './eval/filterProviders';
import { filterTests } from './eval/filterTests';

export async function doEval(
  cmdObj: CommandLineOptions & Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
  evaluateOptions: EvaluateOptions,
) {
  setupEnv(cmdObj.envPath);
  let config: Partial<UnifiedConfig> | undefined = undefined;
  let testSuite: TestSuite | undefined = undefined;
  let _basePath: string | undefined = undefined;

  const runEvaluation = async (initialization?: boolean) => {
    const startTime = Date.now();
    telemetry.record('command_used', {
      name: 'eval - started',
      watch: Boolean(cmdObj.watch),
    });
    await telemetry.send();

    // Misc settings
    if (cmdObj.verbose) {
      setLogLevel('debug');
    }
    const iterations = Number.parseInt(cmdObj.repeat || '', 10);
    const repeat = !Number.isNaN(iterations) && iterations > 0 ? iterations : 1;
    if (!cmdObj.cache || repeat > 1) {
      logger.info('Cache is disabled.');
      disableCache();
    }

    ({ config, testSuite, basePath: _basePath } = await resolveConfigs(cmdObj, defaultConfig));

    let maxConcurrency = Number.parseInt(cmdObj.maxConcurrency || '', 10);
    const delay = Number.parseInt(cmdObj.delay || '', 0);

    if (delay > 0) {
      maxConcurrency = 1;
      logger.info(
        `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
      );
    }

    testSuite.tests = await filterTests(testSuite, {
      firstN: cmdObj.filterFirstN,
      pattern: cmdObj.filterPattern,
      failing: cmdObj.filterFailing,
    });

    testSuite.providers = filterProviders(testSuite.providers, cmdObj.filterProviders);

    const options: EvaluateOptions = {
      showProgressBar: getLogLevel() === 'debug' ? false : cmdObj.progressBar,
      maxConcurrency:
        !Number.isNaN(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : undefined,
      repeat,
      delay: !Number.isNaN(delay) && delay > 0 ? delay : undefined,
      ...evaluateOptions,
    };

    if (cmdObj.grader) {
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.options = testSuite.defaultTest.options || {};
      testSuite.defaultTest.options.provider = await loadApiProvider(cmdObj.grader);
    }
    if (cmdObj.var) {
      testSuite.defaultTest = testSuite.defaultTest || {};
      testSuite.defaultTest.vars = { ...testSuite.defaultTest.vars, ...cmdObj.var };
    }
    if (cmdObj.generateSuggestions) {
      options.generateSuggestions = true;
    }
    // load scenarios or tests from an external file
    if (testSuite.scenarios) {
      testSuite.scenarios = (await maybeLoadFromExternalFile(testSuite.scenarios)) as Scenario[];
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
      
        ${JSON.stringify(testSuiteSchema.error.format())}
      
      Please review your promptfooconfig.yaml configuration.`),
      );
    }

    const summary = await evaluate(testSuite, {
      ...options,
      eventSource: 'cli',
    });

    const shareableUrl =
      cmdObj.share && config.sharing ? await createShareableUrl(summary, config) : null;

    if (cmdObj.table && getLogLevel() !== 'debug') {
      // Output CLI table
      const table = generateTable(summary, Number.parseInt(cmdObj.tableCellMaxLength || '', 10));

      logger.info('\n' + table.toString());
      if (summary.table.body.length > 25) {
        const rowsLeft = summary.table.body.length - 25;
        logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
      }
    } else if (summary.stats.failures !== 0) {
      logger.debug(
        `At least one evaluation failure occurred. This might be caused by the underlying call to the provider, or a test failure. Context: \n${JSON.stringify(
          summary.results,
        )}`,
      );
    }

    await migrateResultsFromFileSystemToDatabase();

    if (getEnvBool('PROMPTFOO_LIGHTWEIGHT_RESULTS')) {
      config = {};
      summary.results = [];
      summary.table.head.vars = [];
      for (const row of summary.table.body) {
        row.vars = [];
      }
    }

    let evalId: string | null = null;
    if (cmdObj.write) {
      evalId = await writeResultsToDatabase(summary, config);
    }

    const { outputPath } = config;
    if (outputPath) {
      // Write output to file
      if (typeof outputPath === 'string') {
        await writeOutput(outputPath, evalId, summary, config, shareableUrl);
      } else if (Array.isArray(outputPath)) {
        await writeMultipleOutputs(outputPath, evalId, summary, config, shareableUrl);
      }
      logger.info(chalk.yellow(`Writing output to ${outputPath}`));
    }

    printBorder();
    if (cmdObj.write) {
      if (shareableUrl) {
        logger.info(`${chalk.green('✔')} Evaluation complete: ${shareableUrl}`);
      } else {
        logger.info(`${chalk.green('✔')} Evaluation complete.\n`);
        logger.info(
          `» Run ${chalk.greenBright.bold('promptfoo view')} to use the local web viewer`,
        );
        logger.info(`» Run ${chalk.greenBright.bold('promptfoo share')} to create a shareable URL`);
        logger.info(
          `» This project needs your feedback. What's one thing we can improve? ${chalk.greenBright.bold(
            'https://forms.gle/YFLgTe1dKJKNSCsU7',
          )}`,
        );
      }
    } else {
      logger.info(`${chalk.green('✔')} Evaluation complete`);
    }
    printBorder();
    const totalTests = summary.stats.successes + summary.stats.failures;
    const passRate = (summary.stats.successes / totalTests) * 100;
    logger.info(chalk.green.bold(`Successes: ${summary.stats.successes}`));
    logger.info(chalk.red.bold(`Failures: ${summary.stats.failures}`));
    logger.info(chalk.blue.bold(`Pass Rate: ${passRate.toFixed(2)}%`));
    logger.info(
      `Token usage: Total ${summary.stats.tokenUsage.total}, Prompt ${summary.stats.tokenUsage.prompt}, Completion ${summary.stats.tokenUsage.completion}, Cached ${summary.stats.tokenUsage.cached}`,
    );

    telemetry.record('command_used', {
      name: 'eval',
      watch: Boolean(cmdObj.watch),
      duration: Math.round((Date.now() - startTime) / 1000),
      isRedteam: Boolean(testSuite.redteam),
    });
    await telemetry.send();

    if (cmdObj.watch) {
      if (initialization) {
        const configPaths = (cmdObj.config || [defaultConfigPath]).filter(Boolean) as string[];
        if (!configPaths.length) {
          logger.error('Could not locate config file(s) to watch');
          process.exit(1);
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
                } else if (typeof t !== 'string' && t.vars) {
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
        logger.info('Done.');
        process.exit(Number.isSafeInteger(failedTestExitCode) ? failedTestExitCode : 100);
      } else {
        logger.info('Done.');
      }
    }
  };

  await runEvaluation(true /* initialization */);
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

  program
    .command('eval')
    .description('Evaluate prompts')
    .option('-p, --prompts <paths...>', 'Paths to prompt files (.txt)')
    .option(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
    )
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.js/json/yaml',
    )
    .option(
      // TODO(ian): Remove `vars` for v1
      '-v, --vars, -t, --tests <path>',
      'Path to CSV with test cases',
      defaultConfig?.commandLineOptions?.vars,
    )
    .option('-a, --assertions <path>', 'Path to assertions file')
    .option('--model-outputs <path>', 'Path to JSON containing list of LLM output strings')
    .option('-t, --tests <path>', 'Path to CSV with test cases')
    .option(
      '-o, --output <paths...>',
      'Path to output file (csv, txt, json, yaml, yml, html), default is no output file',
    )
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      defaultConfig.evaluateOptions?.maxConcurrency
        ? String(defaultConfig.evaluateOptions.maxConcurrency)
        : `${DEFAULT_MAX_CONCURRENCY}`,
    )
    .option(
      '--repeat <number>',
      'Number of times to run each test',
      defaultConfig.evaluateOptions?.repeat ? String(defaultConfig.evaluateOptions.repeat) : '1',
    )
    .option(
      '--delay <number>',
      'Delay between each test (in milliseconds)',
      defaultConfig.evaluateOptions?.delay ? String(defaultConfig.evaluateOptions.delay) : '0',
    )
    .option(
      '--table-cell-max-length <number>',
      'Truncate console table cells to this length',
      '250',
    )
    .option(
      '--suggest-prompts <number>',
      'Generate N new prompts and append them to the prompt list',
    )
    .option(
      '--prompt-prefix <path>',
      'This prefix is prepended to every prompt',
      defaultConfig.defaultTest?.options?.prefix,
    )
    .option(
      '--prompt-suffix <path>',
      'This suffix is append to every prompt',
      defaultConfig.defaultTest?.options?.suffix,
    )
    .option(
      '--no-write',
      'Do not write results to promptfoo directory',
      defaultConfig?.commandLineOptions?.write,
    )
    .option(
      '--no-cache',
      'Do not read or write results to disk cache',
      // TODO(ian): Remove commandLineOptions.cache in v1
      defaultConfig?.commandLineOptions?.cache ?? defaultConfig?.evaluateOptions?.cache,
    )
    .option('--no-progress-bar', 'Do not show progress bar')
    .option('--table', 'Output table in CLI', defaultConfig?.commandLineOptions?.table ?? true)
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option('--share', 'Create a shareable URL', defaultConfig?.commandLineOptions?.share)
    .option(
      '--grader <provider>',
      'Model that will grade outputs',
      defaultConfig?.commandLineOptions?.grader,
    )
    .option('--verbose', 'Show debug logs', defaultConfig?.commandLineOptions?.verbose)
    .option('-w, --watch', 'Watch for changes in config and re-run')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n, --filter-first-n <number>', 'Only run the first N tests')
    .option(
      '--filter-pattern <pattern>',
      'Only run tests whose description matches the regular expression pattern',
    )
    .option('--filter-providers <providers>', 'Only run tests with these providers')
    .option('--filter-failing <path>', 'Path to json output file')
    .option(
      '--var <key=value>',
      'Set a variable in key=value format',
      (value, previous: Record<string, string> = {}) => {
        const [key, val] = value.split('=');
        if (!key || val === undefined) {
          throw new Error('--var must be specified in key=value format.');
        }
        previous[key] = val;
        return previous;
      },
      {},
    )
    .option('--description <description>', 'Description of the eval run')
    .option(
      '--interactive-providers',
      'Run providers interactively, one at a time',
      defaultConfig?.evaluateOptions?.interactiveProviders,
    )
    .option('--remote', 'Force remote inference wherever possible (used for red teams)', false)
    .action((opts) => {
      if (opts.interactiveProviders) {
        logger.warn(
          chalk.yellow(dedent`
          Warning: The --interactive-providers option has been removed.

          Instead, use -j 1 to run evaluations with a concurrency of 1:
          ${chalk.green('promptfoo eval -j 1')}
        `),
        );
        process.exit(2);
      }

      if (opts.remote) {
        cliState.remote = true;
      }

      for (const maybeFilePath of opts.output ?? []) {
        const { data: extension } = OutputFileExtension.safeParse(
          maybeFilePath.split('.').pop()?.toLowerCase(),
        );
        invariant(
          extension,
          `Unsupported output file format: ${maybeFilePath}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
        );
      }
      doEval(opts, defaultConfig, defaultConfigPath, evaluateOptions);
    });
}
