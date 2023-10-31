#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join as pathJoin, dirname } from 'path';
import readline from 'readline';

import chalk from 'chalk';
import { Command } from 'commander';

import telemetry from './telemetry';
import logger, { getLogLevel, setLogLevel } from './logger';
import { loadApiProvider, loadApiProviders } from './providers';
import { evaluate, DEFAULT_MAX_CONCURRENCY } from './evaluator';
import { readPrompts, readProviderPromptMap } from './prompts';
import { readTest, readTests } from './testCases';
import {
  cleanupOldResults,
  maybeReadConfig,
  printBorder,
  readConfig,
  readFilters,
  readLatestResults,
  writeLatestResults,
  writeOutput,
  writeMultipleOutputs,
  setConfigDirectoryPath,
} from './util';
import { DEFAULT_README, DEFAULT_YAML_CONFIG, DEFAULT_PROMPTS } from './onboarding';
import { disableCache, clearCache } from './cache';
import { getDirectory } from './esm';
import { startServer } from './web/server';
import { checkForUpdates } from './updates';
import { gatherFeedback } from './feedback';
import { listCommand } from './commands/list';
import { showCommand } from './commands/show';

import type {
  CommandLineOptions,
  EvaluateOptions,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types';
import { generateTable } from './table';
import { createShareableUrl } from './share';

function createDummyFiles(directory: string | null) {
  if (directory) {
    // Make the directory if it doesn't exist
    if (!existsSync(directory)) {
      mkdirSync(directory);
    }
  }

  if (directory) {
    if (!existsSync(directory)) {
      logger.info(`Creating directory ${directory} ...`);
      mkdirSync(directory);
    }
  } else {
    directory = '.';
  }

  writeFileSync(pathJoin(process.cwd(), directory, 'prompts.txt'), DEFAULT_PROMPTS);
  writeFileSync(pathJoin(process.cwd(), directory, 'promptfooconfig.yaml'), DEFAULT_YAML_CONFIG);
  writeFileSync(pathJoin(process.cwd(), directory, 'README.md'), DEFAULT_README);

  if (directory === '.') {
    logger.info(
      chalk.green.bold(
        'Wrote prompts.txt and promptfooconfig.yaml. Open README.md to get started!',
      ),
    );
  } else {
    logger.info(chalk.green.bold(`Wrote prompts.txt and promptfooconfig.yaml to ./${directory}`));
    logger.info(chalk.green(`\`cd ${directory}\` and open README.md to get started!`));
  }
}

async function main() {
  await checkForUpdates();

  const pwd = process.cwd();
  const potentialPaths = [
    pathJoin(pwd, 'promptfooconfig.js'),
    pathJoin(pwd, 'promptfooconfig.json'),
    pathJoin(pwd, 'promptfooconfig.yaml'),
  ];
  let defaultConfig: Partial<UnifiedConfig> = {};
  for (const path of potentialPaths) {
    const maybeConfig = await maybeReadConfig(path);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      break;
    }
  }

  let evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
  }

  const program = new Command();

  program.option('--version', 'Print version', () => {
    const packageJson = JSON.parse(
      readFileSync(pathJoin(getDirectory(), '../package.json'), 'utf8'),
    );
    logger.info(packageJson.version);
    process.exit(0);
  });

  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .action(async (directory: string | null) => {
      telemetry.maybeShowNotice();
      createDummyFiles(directory);
      telemetry.record('command_used', {
        name: 'init',
      });
      await telemetry.send();
    });

  program
    .command('view [directory]')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .action(async (directory: string | undefined, cmdObj: { port: number; yes: boolean } & Command) => {
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'view',
      });
      await telemetry.send();

      console.log(directory);
      if (directory) {
        setConfigDirectoryPath(directory);
      }
      startServer(cmdObj.port, cmdObj.yes);
    });

  program
    .command('share')
    .description('Create a shareable URL of your most recent eval')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (cmdObj: { yes: boolean } & Command) => {
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'share',
      });
      await telemetry.send();

      const createPublicUrl = async () => {
        const latestResults = readLatestResults();
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
          'Are you sure you want to create a shareable URL of your most recent eval? Anyone you give this URL to will be able to view the results [Y/n] ',
          async function (answer: string) {
            if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y' && answer !== '') {
              reader.close();
              return;
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
    .action(async () => {
      telemetry.maybeShowNotice();
      await clearCache();
      cleanupOldResults(0);
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

  program
    .command('eval')
    .description('Evaluate prompts')
    .option('-p, --prompts <paths...>', 'Paths to prompt files (.txt)')
    .option(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
    )
    .option(
      '-c, --config <path>',
      'Path to configuration file. Automatically loads promptfooconfig.js/json/yaml',
    )
    .option(
      // TODO(ian): Remove `vars` for v1
      '-v, --vars, -t, --tests <path>',
      'Path to CSV with test cases',
      defaultConfig?.commandLineOptions?.vars,
    )
    .option('-t, --tests <path>', 'Path to CSV with test cases')
    .option('-o, --output <paths...>', 'Path to output file (csv, txt, json, yaml, yml, html)')
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
    .option('--no-table', 'Do not output table in CLI', defaultConfig?.commandLineOptions?.table)
    .option('--share', 'Create a shareable URL', defaultConfig?.commandLineOptions?.share)
    .option(
      '--grader <provider>',
      'Model that will grade outputs',
      defaultConfig?.commandLineOptions?.grader,
    )
    .option('--verbose', 'Show debug logs', defaultConfig?.commandLineOptions?.verbose)
    .option('--view [port]', 'View in browser ui')
    .action(async (cmdObj: CommandLineOptions & Command) => {
      // Misc settings
      if (cmdObj.verbose) {
        setLogLevel('debug');
      }
      if (!cmdObj.cache) {
        disableCache();
      }

      // Config parsing
      let fileConfig: Partial<UnifiedConfig> = {};
      const configPath = cmdObj.config;
      if (configPath) {
        fileConfig = await readConfig(configPath);
      }

      // Use basepath in cases where path was supplied in the config file
      const basePath = configPath ? dirname(configPath) : '';

      const defaultTestRaw = fileConfig.defaultTest || defaultConfig.defaultTest;
      const config: Partial<UnifiedConfig> = {
        prompts: cmdObj.prompts || fileConfig.prompts || defaultConfig.prompts,
        providers: cmdObj.providers || fileConfig.providers || defaultConfig.providers,
        tests: cmdObj.tests || cmdObj.vars || fileConfig.tests || defaultConfig.tests,
        scenarios: fileConfig.scenarios || defaultConfig.scenarios,
        sharing:
          process.env.PROMPTFOO_DISABLE_SHARING === '1'
            ? false
            : fileConfig.sharing ?? defaultConfig.sharing ?? true,
        defaultTest: defaultTestRaw ? await readTest(defaultTestRaw, basePath) : undefined,
      };

      // Validation
      if (!config.prompts || config.prompts.length === 0) {
        logger.error(chalk.red('You must provide at least 1 prompt file'));
        process.exit(1);
      }
      if (!config.providers || config.providers.length === 0) {
        logger.error(
          chalk.red('You must specify at least 1 provider (for example, openai:gpt-3.5-turbo)'),
        );
        process.exit(1);
      }

      // Parse prompts, providers, and tests

      const parsedPrompts = readPrompts(config.prompts, cmdObj.prompts ? undefined : basePath);
      const parsedProviders = await loadApiProviders(config.providers, { basePath });
      const parsedTests: TestCase[] = await readTests(
        config.tests,
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
        nunjucksFilters: readFilters(
          fileConfig.nunjucksFilters || defaultConfig.nunjucksFilters || {},
          basePath,
        ),
      };

      let maxConcurrency = parseInt(cmdObj.maxConcurrency || '', 10);
      const iterations = parseInt(cmdObj.repeat || '', 10);
      const delay = parseInt(cmdObj.delay || '', 0);

      if (delay > 0) {
        maxConcurrency = 1;
        logger.info(
          `Running at concurrency=1 because ${delay}ms delay was requested between API calls`,
        );
      }

      const options: EvaluateOptions = {
        showProgressBar:
          typeof cmdObj.progressBar === 'undefined'
            ? getLogLevel() !== 'debug'
            : cmdObj.progressBar,
        maxConcurrency: !isNaN(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : undefined,
        repeat: !isNaN(iterations) && iterations > 0 ? iterations : 1,
        delay: !isNaN(delay) && delay > 0 ? delay : undefined,
        ...evaluateOptions,
      };

      if (cmdObj.grader && testSuite.defaultTest) {
        testSuite.defaultTest.options = testSuite.defaultTest.options || {};
        testSuite.defaultTest.options.provider = await loadApiProvider(cmdObj.grader);
      }
      if (cmdObj.generateSuggestions) {
        options.generateSuggestions = true;
      }

      const summary = await evaluate(testSuite, options);

      const shareableUrl =
        cmdObj.share && config.sharing ? await createShareableUrl(summary, config) : null;

      const outputPath = cmdObj.output || fileConfig.outputPath || defaultConfig.outputPath;
      if (outputPath) {
        if (typeof outputPath === 'string') {
          writeOutput(outputPath, summary, config, shareableUrl);
        } else if (Array.isArray(outputPath)) {
          writeMultipleOutputs(outputPath, summary, config, shareableUrl);
        }
        logger.info(chalk.yellow(`Writing output to ${outputPath}`));
      } else if (cmdObj.table && getLogLevel() !== 'debug') {
        // Output table by default
        const table = generateTable(summary, parseInt(cmdObj.tableCellMaxLength || '', 10));

        logger.info('\n' + table.toString());
        if (summary.table.body.length > 25) {
          const rowsLeft = summary.table.body.length - 25;
          logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
        }
      }

      telemetry.maybeShowNotice();

      printBorder();
      if (!cmdObj.write) {
        logger.info(`${chalk.green('✔')} Evaluation complete`);
      } else {
        writeLatestResults(summary, config);

        if (cmdObj.view) {
          logger.info(`${chalk.green('✔')} Evaluation complete. Launching web viewer...`);
        } else if (shareableUrl) {
          logger.info(`${chalk.green('✔')} Evaluation complete: ${shareableUrl}`);
        } else {
          logger.info(`${chalk.green('✔')} Evaluation complete.\n`);
          logger.info(`Run ${chalk.greenBright('promptfoo view')} to use the local web viewer`);
          logger.info(`Run ${chalk.greenBright('promptfoo share')} to create a shareable URL`);
          logger.info(
            `Run ${chalk.greenBright(
              'promptfoo feedback',
            )} to share feedback with the developers of this tool`,
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
      });
      await telemetry.send();

      logger.info('Done.');

      if (cmdObj.view) {
        startServer(parseInt(cmdObj.view, 10) || 15500);
      }
    });

  listCommand(program);
  showCommand(program);

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main();
