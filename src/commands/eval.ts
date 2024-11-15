import chalk from 'chalk';
import chokidar from 'chokidar';
import type { Command } from 'commander';
import dedent from 'dedent';
import fs from 'fs';
import * as path from 'path';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { disableCache } from '../cache';
import cliState from '../cliState';
import { getEnvFloat, getEnvInt } from '../envars';
import { DEFAULT_MAX_CONCURRENCY, evaluate } from '../evaluator';
import { promptForEmailUnverified } from '../globalConfig/accounts';
import logger, { getLogLevel, setLogLevel } from '../logger';
import { runDbMigrations } from '../migrate';
import Eval from '../models/eval';
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
import { CommandLineOptionsSchema } from '../types';
import { maybeLoadFromExternalFile } from '../util';
import { printBorder, setupEnv, writeMultipleOutputs } from '../util';
import { clearConfigCache, loadDefaultConfig } from '../util/config/default';
import { resolveConfigs, combineConfigs } from '../util/config/load';
import { filterProviders } from './eval/filterProviders';
import { filterTests } from './eval/filterTests';

const EvalCommandSchema = CommandLineOptionsSchema.extend({
  help: z.boolean().optional(),
  interactiveProviders: z.boolean().optional(),
  remote: z.boolean().optional(),
}).partial();

type EvalCommandOptions = z.infer<typeof EvalCommandSchema>;

function showRedteamProviderLabelMissingWarning(testSuite: TestSuite) {
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
) {
  setupEnv(cmdObj.envPath);
  if (cmdObj.verbose) {
    setLogLevel('debug');
  }

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

    if (cmdObj.write) {
      await runDbMigrations();
    }

    if (cmdObj.config !== undefined) {
      const configPaths: string[] = Array.isArray(cmdObj.config) ? cmdObj.config : [cmdObj.config];
      for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
          const { defaultConfig: dirConfig, defaultConfigPath: newConfigPath } =
            await loadDefaultConfig(undefined, configPath);
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

    ({ config, testSuite, basePath: _basePath } = await resolveConfigs(cmdObj, defaultConfig));

    let maxConcurrency = cmdObj.maxConcurrency;
    const delay = cmdObj.delay ?? 0;

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
      sample: cmdObj.filterSample,
    });

    if (
      config.redteam &&
      config.redteam.plugins &&
      config.redteam.plugins.length > 0 &&
      testSuite.tests &&
      testSuite.tests.length > 0
    ) {
      await promptForEmailUnverified();
    }

    testSuite.providers = filterProviders(
      testSuite.providers,
      cmdObj.filterProviders || cmdObj.filterTargets,
    );

    const options: EvaluateOptions = {
      showProgressBar: getLogLevel() === 'debug' ? false : cmdObj.progressBar,
      maxConcurrency,
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
    await evaluate(testSuite, evalRecord, {
      ...options,
      eventSource: 'cli',
    });

    const shareableUrl =
      cmdObj.share && config.sharing ? await createShareableUrl(evalRecord) : null;

    let successes = 0;
    let failures = 0;
    const tokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
    };

    // Calculate our total successes and failures
    for (const prompt of evalRecord.prompts) {
      if (prompt.metrics?.testPassCount) {
        successes += prompt.metrics.testPassCount;
      }
      if (prompt.metrics?.testFailCount) {
        failures += prompt.metrics.testFailCount;
      }
      tokenUsage.total += prompt.metrics?.tokenUsage?.total || 0;
      tokenUsage.prompt += prompt.metrics?.tokenUsage?.prompt || 0;
      tokenUsage.completion += prompt.metrics?.tokenUsage?.completion || 0;
      tokenUsage.cached += prompt.metrics?.tokenUsage?.cached || 0;
    }
    const totalTests = successes + failures;
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
      logger.info('No table output will be shown because there are more than 500 tests.');
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

    logger.info(chalk.green.bold(`Successes: ${successes}`));
    logger.info(chalk.red.bold(`Failures: ${failures}`));
    if (!Number.isNaN(passRate)) {
      logger.info(chalk.blue.bold(`Pass Rate: ${passRate.toFixed(2)}%`));
    }
    if (tokenUsage.total > 0) {
      logger.info(
        `Token usage: Total ${tokenUsage.total}, Prompt ${tokenUsage.prompt}, Completion ${tokenUsage.completion}, Cached ${tokenUsage.cached}`,
      );
    }

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
        logger.info('Done.');
        process.exit(Number.isSafeInteger(failedTestExitCode) ? failedTestExitCode : 100);
      } else {
        logger.info('Done.');
      }
    }
    if (testSuite.redteam) {
      showRedteamProviderLabelMissingWarning(testSuite);
    }
  };

  await runEvaluation(true /* initialization */);
}

function setOptsWithConfig(
  opts: EvalCommandOptions,
  config: Partial<UnifiedConfig>,
): EvalCommandOptions {
  // If `opts.hasOwnProperty` returns true, it tells us the user has set a value for that flag.

  // The following options do not have a `--no` flag, and may need defaults based on the config.
  if (!opts.hasOwnProperty('repeat')) {
    opts.repeat = config.evaluateOptions?.repeat ?? 1;
  }

  if (!opts.hasOwnProperty('delay')) {
    opts.delay = config.evaluateOptions?.delay ?? 0;
  }

  if (!opts.hasOwnProperty('maxConcurrency')) {
    opts.maxConcurrency = config.evaluateOptions?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  }

  if (!opts.hasOwnProperty('verbose')) {
    opts.verbose = config.commandLineOptions?.verbose ?? false;
  }

  if (!opts.hasOwnProperty('vars') && config.commandLineOptions?.vars) {
    opts.vars = config.commandLineOptions.vars;
  }

  if (!opts.hasOwnProperty('promptPrefix') && config.defaultTest?.options?.prefix) {
    opts.promptPrefix = config.defaultTest.options.prefix;
  }

  if (!opts.hasOwnProperty('promptSuffix') && config.defaultTest?.options?.suffix) {
    opts.promptSuffix = config.defaultTest.options.suffix;
  }

  if (!opts.hasOwnProperty('grader') && config.commandLineOptions?.grader) {
    opts.grader = config.commandLineOptions.grader;
  }

  if (!opts.hasOwnProperty('share') && config.commandLineOptions?.share) {
    opts.share = config.commandLineOptions?.share;
  }

  // The table property has both a no flag and a regular flag. It is a 1 of 1 in this pattern.
  if (!opts.hasOwnProperty('table')) {
    opts.table = config.commandLineOptions?.table ?? true;
  }

  // The following options all have only a `--no-___` flag.
  // This means they default to true. So we give user input precedence by checking if the opt is false.
  if (opts.cache !== false) {
    // What should the precedence be between commandLineOptions.cache & evaluateOptions.cache?
    const evaluateCache = config.evaluateOptions?.cache;
    const commandLineCache = config.commandLineOptions?.cache;

    const cache = evaluateCache ?? commandLineCache;
    opts.cache = cache ?? true;
  }

  if (opts.write !== false && config.commandLineOptions?.write) {
    opts.write = config.commandLineOptions?.write;
  }

  if (opts.progressBar !== false && config.evaluateOptions?.showProgressBar) {
    opts.progressBar = config.evaluateOptions?.showProgressBar;
  }

  return opts;
}

export function evalCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  let config: Partial<UnifiedConfig> = defaultConfig;
  const evalCmd = program
    .command('eval')
    .description('Evaluate prompts')

    // Core configuration
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.js/json/yaml',
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')

    // Input sources
    .option('-a, --assertions <path>', 'Path to assertions file')
    .option('-p, --prompts <paths...>', 'Paths to prompt files (.txt)')
    .option(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
    )
    .option('-t, --tests <path>', 'Path to CSV with test cases')
    .option('-v, --vars <path>', 'Path to CSV with test cases (alias for --tests)')
    .option('--model-outputs <path>', 'Path to JSON containing list of LLM output strings')

    // Prompt modification
    .option('--prompt-prefix <path>', 'This prefix is prepended to every prompt')
    .option('--prompt-suffix <path>', 'This suffix is append to every prompt')
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
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls')
    .option('--repeat <number>', 'Number of times to run each test')
    .option('--delay <number>', 'Delay between each test (in milliseconds)')
    .option('--no-cache', 'Do not read or write results to disk cache')
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
    .option('--filter-failing <path>', 'Path to json output file')

    // Output configuration
    .option(
      '-o, --output <paths...>',
      'Path to output file (csv, txt, json, yaml, yml, html), default is no output file',
    )
    .option('--table', 'Output table in CLI')
    .option('--no-table', 'Do not output table in CLI')
    .option(
      '--table-cell-max-length <number>',
      'Truncate console table cells to this length',
      '250',
    )
    .option('--share', 'Create a shareable URL')
    .option('--no-write', 'Do not write results to promptfoo directory')

    // Additional features
    .option('--grader <provider>', 'Model that will grade outputs')
    .option(
      '--suggest-prompts <number>',
      'Generate N new prompts and append them to the prompt list',
    )
    .option('-w, --watch', 'Watch for changes in config and re-run')

    // Miscellaneous
    .option('--description <description>', 'Description of the eval run')
    .option('--verbose', 'Show debug logs')
    .option('--no-progress-bar', 'Do not show progress bar')
    .action(async (opts: EvalCommandOptions, command: Command) => {
      let validatedOpts: z.infer<typeof EvalCommandSchema>;
      try {
        validatedOpts = EvalCommandSchema.parse(opts);
      } catch (err) {
        const validationError = fromError(err);
        logger.error(dedent`
        Invalid command options:
        ${validationError.toString()}
        `);
        process.exitCode = 1;
        return;
      }

      const configPaths = validatedOpts.config as string[];
      if (configPaths) {
        // Overwrite the defaultConfig (e.g. `./promptfooconfig.yaml`) with the config file specified by the user.
        config = await combineConfigs(configPaths);
      }
      if (command.args.length > 0) {
        logger.warn(`Unknown command: ${command.args[0]}. Did you mean -c ${command.args[0]}?`);
      }

      // Set options with defaults based on the config.
      // Precedence is: 1. CLI provided value 2. Config provided input.
      const optsWithConfigValues = setOptsWithConfig(validatedOpts, config);

      if (optsWithConfigValues.help) {
        evalCmd.help();
        return;
      }

      if (optsWithConfigValues.interactiveProviders) {
        logger.warn(
          chalk.yellow(dedent`
          Warning: The --interactive-providers option has been removed.

          Instead, use -j 1 to run evaluations with a concurrency of 1:
          ${chalk.green('promptfoo eval -j 1')}
        `),
        );
        process.exit(2);
      }

      if (optsWithConfigValues.remote) {
        cliState.remote = true;
      }

      for (const maybeFilePath of optsWithConfigValues.output ?? []) {
        const { data: extension } = OutputFileExtension.safeParse(
          maybeFilePath.split('.').pop()?.toLowerCase(),
        );
        invariant(
          extension,
          `Unsupported output file format: ${maybeFilePath}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
        );
      }

      const evaluateOptions: EvaluateOptions = {};
      if (config.evaluateOptions) {
        evaluateOptions.generateSuggestions = config.evaluateOptions.generateSuggestions;
      }

      console.log('Passing optsWithConfigValues', optsWithConfigValues);
      doEval(
        optsWithConfigValues as Partial<CommandLineOptions & Command>,
        config,
        defaultConfigPath,
        evaluateOptions,
      );
    });

  return evalCmd;
}
