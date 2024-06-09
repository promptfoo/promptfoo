#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import chalk from 'chalk';
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import { Command } from 'commander';

import cliState from './cliState';
import telemetry from './telemetry';
import logger, { getLogLevel, setLogLevel } from './logger';
import { readAssertions } from './assertions';
import { loadApiProvider, loadApiProviders } from './providers';
import { evaluate, DEFAULT_MAX_CONCURRENCY } from './evaluator';
import { readPrompts, readProviderPromptMap } from './prompts';
import { readTest, readTests, synthesizeFromTestSuite } from './testCases';
import { synthesizeFromTestSuite as redteamSynthesizeFromTestSuite } from './redteam';
import {
  cleanupOldFileResults,
  maybeReadConfig,
  migrateResultsFromFileSystemToDatabase,
  printBorder,
  readConfigs,
  readFilters,
  readLatestResults,
  setConfigDirectoryPath,
  setupEnv,
  writeMultipleOutputs,
  writeOutput,
  writeResultsToDatabase,
} from './util';
import { createDummyFiles } from './onboarding';
import { disableCache, clearCache } from './cache';
import { getDirectory } from './esm';
import { BrowserBehavior, startServer } from './web/server';
import { checkForUpdates } from './updates';
import { gatherFeedback } from './feedback';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';
import { deleteCommand } from './commands/delete';
import { importCommand } from './commands/import';
import { exportCommand } from './commands/export';

import type {
  CommandLineOptions,
  EvaluateOptions,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types';
import { generateTable } from './table';
import { createShareableUrl } from './share';
import { filterTests } from './commands/eval/filterTests';
import { validateAssertions } from './assertions/validateAssertions';
import dedent from 'dedent';

async function resolveConfigs(
  cmdObj: Partial<CommandLineOptions>,
  defaultConfig: Partial<UnifiedConfig>,
): Promise<{ testSuite: TestSuite; config: Partial<UnifiedConfig>; basePath: string }> {
  // Config parsing
  let fileConfig: Partial<UnifiedConfig> = {};
  const configPaths = cmdObj.config;
  if (configPaths) {
    fileConfig = await readConfigs(configPaths);
  }

  // Standalone assertion mode
  if (cmdObj.assertions) {
    if (!cmdObj.modelOutputs) {
      logger.error(chalk.red('You must provide --model-outputs when using --assertions'));
      process.exit(1);
    }
    const modelOutputs = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), cmdObj.modelOutputs), 'utf8'),
    ) as string[] | { output: string; tags?: string[] }[];
    const assertions = await readAssertions(cmdObj.assertions);
    fileConfig.prompts = ['{{output}}'];
    fileConfig.providers = ['echo'];
    fileConfig.tests = modelOutputs.map((output) => {
      if (typeof output === 'string') {
        return {
          vars: {
            output,
          },
          assert: assertions,
        };
      }
      return {
        vars: {
          output: output.output,
          ...(output.tags === undefined ? {} : { tags: output.tags.join(', ') }),
        },
        assert: assertions,
      };
    });
  }

  // Use basepath in cases where path was supplied in the config file
  const basePath = configPaths ? path.dirname(configPaths[0]) : '';

  const defaultTestRaw = fileConfig.defaultTest || defaultConfig.defaultTest;
  const config: Omit<UnifiedConfig, 'evaluateOptions' | 'commandLineOptions'> = {
    description: fileConfig.description || defaultConfig.description,
    prompts: cmdObj.prompts || fileConfig.prompts || defaultConfig.prompts || [],
    providers: cmdObj.providers || fileConfig.providers || defaultConfig.providers || [],
    tests: cmdObj.tests || cmdObj.vars || fileConfig.tests || defaultConfig.tests || [],
    scenarios: fileConfig.scenarios || defaultConfig.scenarios,
    env: fileConfig.env || defaultConfig.env,
    sharing:
      process.env.PROMPTFOO_DISABLE_SHARING === '1'
        ? false
        : fileConfig.sharing ?? defaultConfig.sharing ?? true,
    defaultTest: defaultTestRaw ? await readTest(defaultTestRaw, basePath) : undefined,
    outputPath: cmdObj.output || fileConfig.outputPath || defaultConfig.outputPath,
  };

  // Validation
  if (!config.prompts || config.prompts.length === 0) {
    logger.error(chalk.red('You must provide at least 1 prompt'));
    process.exit(1);
  }
  if (!config.providers || config.providers.length === 0) {
    logger.error(
      chalk.red('You must specify at least 1 provider (for example, openai:gpt-3.5-turbo)'),
    );
    process.exit(1);
  }

  // Parse prompts, providers, and tests
  const parsedPrompts = await readPrompts(config.prompts, cmdObj.prompts ? undefined : basePath);
  const parsedProviders = await loadApiProviders(config.providers, {
    env: config.env,
    basePath,
  });
  const parsedTests: TestCase[] = await readTests(
    config.tests || [],
    cmdObj.tests ? undefined : basePath,
  );

  // Parse testCases for each scenario
  if (fileConfig.scenarios) {
    for (const scenario of fileConfig.scenarios) {
      const parsedScenarioTests: TestCase[] = await readTests(
        scenario.tests,
        cmdObj.tests ? undefined : basePath,
      );
      scenario.tests = parsedScenarioTests;
    }
  }

  const parsedProviderPromptMap = readProviderPromptMap(config, parsedPrompts);

  if (parsedPrompts.length === 0) {
    logger.error(chalk.red('No prompts found'));
    process.exit(1);
  }

  const defaultTest: TestCase = {
    options: {
      prefix: cmdObj.promptPrefix,
      suffix: cmdObj.promptSuffix,
      provider: cmdObj.grader,
      // rubricPrompt
      ...(config.defaultTest?.options || {}),
    },
    ...config.defaultTest,
  };

  const testSuite: TestSuite = {
    description: config.description,
    prompts: parsedPrompts,
    providers: parsedProviders,
    providerPromptMap: parsedProviderPromptMap,
    tests: parsedTests,
    scenarios: config.scenarios,
    defaultTest,
    nunjucksFilters: await readFilters(
      fileConfig.nunjucksFilters || defaultConfig.nunjucksFilters || {},
    ),
  };

  if (testSuite.tests) {
    validateAssertions(testSuite.tests);
  }

  return { config, testSuite, basePath };
}

async function main() {
  await checkForUpdates();

  const pwd = process.cwd();
  const potentialPaths = [
    path.join(pwd, 'promptfooconfig.js'),
    path.join(pwd, 'promptfooconfig.json'),
    path.join(pwd, 'promptfooconfig.yaml'),
  ];
  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;
  for (const _path of potentialPaths) {
    const maybeConfig = await maybeReadConfig(_path);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      defaultConfigPath = _path;
      break;
    }
  }

  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
    evaluateOptions.interactiveProviders = defaultConfig.evaluateOptions.interactiveProviders;
  }

  const program = new Command();

  program.option('--version', 'Print version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(getDirectory(), '../package.json'), 'utf8'),
    );
    logger.info(packageJson.version);
  });

  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .option('--no-interactive', 'Run in interactive mode')
    .action(async (directory: string | null, cmdObj: { interactive: boolean }) => {
      telemetry.maybeShowNotice();
      const details = await createDummyFiles(directory, cmdObj.interactive);
      telemetry.record('command_used', {
        ...details,
        name: 'init',
      });
      await telemetry.send();
    });

  program
    .command('view [directory]')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--api-base-url <url>', 'Base URL for viewer API calls')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async (
        directory: string | undefined,
        cmdObj: {
          port: number;
          yes: boolean;
          no: boolean;
          apiBaseUrl?: string;
          envFile?: string;
          filterDescription?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envFile);
        telemetry.maybeShowNotice();
        telemetry.record('command_used', {
          name: 'view',
        });
        await telemetry.send();

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        // Block indefinitely on server
        const browserBehavior = cmdObj.yes
          ? BrowserBehavior.OPEN
          : cmdObj.no
            ? BrowserBehavior.SKIP
            : BrowserBehavior.ASK;
        await startServer(
          cmdObj.port,
          cmdObj.apiBaseUrl,
          browserBehavior,
          cmdObj.filterDescription,
        );
      },
    );

  program
    .command('share')
    .description('Create a shareable URL of your most recent eval')
    .option('-y, --yes', 'Skip confirmation')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { yes: boolean; envFile?: string } & Command) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'share',
      });
      await telemetry.send();

      const createPublicUrl = async () => {
        const latestResults = await readLatestResults();
        if (!latestResults) {
          logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
          process.exit(1);
        }
        const url = await createShareableUrl(latestResults.results, latestResults.config);
        logger.info(`View results: ${chalk.greenBright.bold(url)}`);
      };

      if (cmdObj.yes || process.env.PROMPTFOO_DISABLE_SHARE_WARNING) {
        createPublicUrl();
      } else {
        const reader = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        reader.question(
          'Create a private shareable URL of your most recent eval?\n\nTo proceed, please confirm [Y/n] ',
          async function (answer: string) {
            if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y' && answer !== '') {
              reader.close();
              process.exit(1);
            }
            reader.close();

            createPublicUrl();
          },
        );
      }
    });

  program
    .command('cache')
    .description('Manage cache')
    .command('clear')
    .description('Clear cache')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { envFile?: string }) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      logger.info('Clearing cache...');
      await clearCache();
      cleanupOldFileResults(0);
      telemetry.record('command_used', {
        name: 'cache_clear',
      });
      await telemetry.send();
    });

  program
    .command('feedback [message]')
    .description('Send feedback to the promptfoo developers')
    .action((message?: string) => {
      gatherFeedback(message);
    });

  const generateCommand = program.command('generate').description('Generate synthetic data');

  generateCommand
    .command('dataset')
    .description('Generate test cases')
    .option(
      '-i, --instructions [instructions]',
      'Additional instructions to follow while generating test cases',
    )
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option('--numPersonas <number>', 'Number of personas to generate', '5')
    .option('--numTestCasesPerPersona <number>', 'Number of test cases per persona', '3')
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async (options: {
        config?: string;
        instructions?: string;
        output?: string;
        numPersonas: string;
        numTestCasesPerPersona: string;
        write: boolean;
        cache: boolean;
        envFile?: string;
      }) => {
        setupEnv(options.envFile);
        if (!options.cache) {
          logger.info('Cache is disabled.');
          disableCache();
        }

        let testSuite: TestSuite;
        const configPath = options.config || defaultConfigPath;
        if (configPath) {
          const resolved = await resolveConfigs(
            {
              config: [configPath],
            },
            defaultConfig,
          );
          testSuite = resolved.testSuite;
        } else {
          throw new Error('Could not find config file. Please use `--config`');
        }

        const startTime = Date.now();
        telemetry.record('command_used', {
          name: 'generate_dataset - started',
          numPrompts: testSuite.prompts.length,
          numTestsExisting: (testSuite.tests || []).length,
        });
        await telemetry.send();

        const results = await synthesizeFromTestSuite(testSuite, {
          instructions: options.instructions,
          numPersonas: parseInt(options.numPersonas, 10),
          numTestCasesPerPersona: parseInt(options.numTestCasesPerPersona, 10),
        });
        const configAddition = { tests: results.map((result) => ({ vars: result })) };
        const yamlString = yaml.dump(configAddition);
        if (options.output) {
          fs.writeFileSync(options.output, yamlString);
          printBorder();
          logger.info(`Wrote ${results.length} new test cases to ${options.output}`);
          printBorder();
        } else {
          printBorder();
          logger.info('New test Cases');
          printBorder();
          logger.info(yamlString);
        }

        printBorder();
        if (options.write && configPath) {
          const existingConfig = yaml.load(
            fs.readFileSync(configPath, 'utf8'),
          ) as Partial<UnifiedConfig>;
          existingConfig.tests = [...(existingConfig.tests || []), ...configAddition.tests];
          fs.writeFileSync(configPath, yaml.dump(existingConfig));
          logger.info(`Wrote ${results.length} new test cases to ${configPath}`);
        } else {
          logger.info(
            `Copy the above test cases or run ${chalk.greenBright(
              'promptfoo generate dataset --write',
            )} to write directly to the config`,
          );
        }

        telemetry.record('command_used', {
          name: 'generate_dataset',
          numPrompts: testSuite.prompts.length,
          numTestsExisting: (testSuite.tests || []).length,
          numTestsGenerated: results.length,
          duration: Math.round((Date.now() - startTime) / 1000),
        });
        await telemetry.send();
      },
    );

  interface RedteamCommandOptions {
    config?: string;
    output?: string;
    write: boolean;
    cache: boolean;
    envFile?: string;
    purpose?: string;
    injectVar?: string;
    plugins?: string[];
  }

  generateCommand
    .command('redteam')
    .description('Generate adversarial test cases')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option('-o, --output [path]', 'Path to output file')
    .option('-w, --write', 'Write results to promptfoo configuration file')
    .option(
      '--purpose <purpose>',
      'Set the system purpose. If not set, the system purpose will be inferred from the config file',
    )
    .option(
      '--injectVar <varname>',
      'Override the variable to inject user input into the prompt. If not set, the variable will defalt to {{query}}',
    )
    .option('--plugins <plugins>', 'Comma-separated list of plugins to use', (val) =>
      val.split(',').map((x) => x.trim()),
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async ({
        config,
        output,
        write,
        cache,
        envFile,
        purpose,
        injectVar,
        plugins,
      }: RedteamCommandOptions) => {
        setupEnv(envFile);
        if (!cache) {
          logger.info('Cache is disabled.');
          disableCache();
        }

        let testSuite: TestSuite;
        const configPath = config || defaultConfigPath;
        if (configPath) {
          const resolved = await resolveConfigs(
            {
              config: [configPath],
            },
            defaultConfig,
          );
          testSuite = resolved.testSuite;
        } else {
          throw new Error('Could not find config file. Please use `--config`');
        }

        const startTime = Date.now();
        telemetry.record('command_used', {
          name: 'generate redteam - started',
          numPrompts: testSuite.prompts.length,
          numTestsExisting: (testSuite.tests || []).length,
        });
        await telemetry.send();

        const redteamTests = await redteamSynthesizeFromTestSuite(testSuite, {
          purpose,
          injectVar,
          plugins,
        });

        if (output) {
          const existingYaml = yaml.load(fs.readFileSync(configPath, 'utf8')) as object;
          const updatedYaml = {
            ...existingYaml,
            tests: redteamTests,
          };
          fs.writeFileSync(output, yaml.dump(updatedYaml, { skipInvalid: true }));
          printBorder();
          logger.info(`Wrote ${redteamTests.length} new test cases to ${output}`);
          printBorder();
        } else if (write && configPath) {
          const existingConfig = yaml.load(
            fs.readFileSync(configPath, 'utf8'),
          ) as Partial<UnifiedConfig>;
          existingConfig.tests = [...(existingConfig.tests || []), ...redteamTests];
          fs.writeFileSync(configPath, yaml.dump(existingConfig));
          logger.info(`Wrote ${redteamTests.length} new test cases to ${configPath}`);
        } else {
          logger.info(yaml.dump(redteamTests, { skipInvalid: true }));
        }

        telemetry.record('command_used', {
          name: 'generate redteam',
          numPrompts: testSuite.prompts.length,
          numTestsExisting: (testSuite.tests || []).length,
          numTestsGenerated: redteamTests.length,
          duration: Math.round((Date.now() - startTime) / 1000),
        });
        await telemetry.send();
      },
    );

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
    .option('--env-file <path>', 'Path to .env file')
    .option(
      '--interactive-providers',
      'Run providers interactively, one at a time',
      defaultConfig?.evaluateOptions?.interactiveProviders,
    )
    .option('-n, --filter-first-n <number>', 'Only run the first N tests')
    .option(
      '--filter-pattern <pattern>',
      'Only run tests whose description matches the regular expression pattern',
    )
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
    .action(async (cmdObj: CommandLineOptions & Command) => {
      setupEnv(cmdObj.envFile);
      let config: Partial<UnifiedConfig> | undefined = undefined;
      let testSuite: TestSuite | undefined = undefined;
      let basePath: string | undefined = undefined;

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
        const iterations = parseInt(cmdObj.repeat || '', 10);
        const repeat = !isNaN(iterations) && iterations > 0 ? iterations : 1;
        if (!cmdObj.cache || repeat > 1) {
          logger.info('Cache is disabled.');
          disableCache();
        }

        ({ config, testSuite, basePath } = await resolveConfigs(cmdObj, defaultConfig));
        cliState.basePath = basePath;

        let maxConcurrency = parseInt(cmdObj.maxConcurrency || '', 10);
        const delay = parseInt(cmdObj.delay || '', 0);

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

        const options: EvaluateOptions = {
          showProgressBar: getLogLevel() === 'debug' ? false : cmdObj.progressBar,
          maxConcurrency: !isNaN(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : undefined,
          repeat,
          delay: !isNaN(delay) && delay > 0 ? delay : undefined,
          interactiveProviders: cmdObj.interactiveProviders,
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

        const summary = await evaluate(testSuite, {
          ...options,
          eventSource: 'cli',
        });

        const shareableUrl =
          cmdObj.share && config.sharing ? await createShareableUrl(summary, config) : null;

        if (cmdObj.table && getLogLevel() !== 'debug') {
          // Output CLI table
          const table = generateTable(summary, parseInt(cmdObj.tableCellMaxLength || '', 10));

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

        telemetry.maybeShowNotice();

        printBorder();
        if (!cmdObj.write) {
          logger.info(`${chalk.green('✔')} Evaluation complete`);
        } else {
          if (shareableUrl) {
            logger.info(`${chalk.green('✔')} Evaluation complete: ${shareableUrl}`);
          } else {
            logger.info(`${chalk.green('✔')} Evaluation complete.\n`);
            logger.info(
              `» Run ${chalk.greenBright.bold('promptfoo view')} to use the local web viewer`,
            );
            logger.info(
              `» Run ${chalk.greenBright.bold('promptfoo share')} to create a shareable URL`,
            );
            logger.info(
              `» This project needs your feedback. What's one thing we can improve? ${chalk.greenBright.bold(
                'https://forms.gle/YFLgTe1dKJKNSCsU7',
              )}`,
            );
          }
        }
        printBorder();
        logger.info(chalk.green.bold(`Successes: ${summary.stats.successes}`));
        logger.info(chalk.red.bold(`Failures: ${summary.stats.failures}`));
        logger.info(
          `Token usage: Total ${summary.stats.tokenUsage.total}, Prompt ${summary.stats.tokenUsage.prompt}, Completion ${summary.stats.tokenUsage.completion}, Cached ${summary.stats.tokenUsage.cached}`,
        );

        telemetry.record('command_used', {
          name: 'eval',
          watch: Boolean(cmdObj.watch),
          duration: Math.round((Date.now() - startTime) / 1000),
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
          logger.info('Done.');

          if (summary.stats.failures > 0) {
            const exitCode = Number(process.env.PROMPTFOO_FAILED_TEST_EXIT_CODE);
            process.exit(isNaN(exitCode) ? 100 : exitCode);
          }
        }
      };

      await runEvaluation(true /* initialization */);
    });

  listCommand(program);
  showCommand(program);
  deleteCommand(program);
  importCommand(program);
  exportCommand(program);

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main();
