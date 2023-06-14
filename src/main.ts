#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join as pathJoin } from 'path';

import Table from 'cli-table3';
import chalk from 'chalk';
import { Command } from 'commander';

import telemetry from './telemetry';
import logger, { getLogLevel, setLogLevel } from './logger';
import { loadApiProvider, loadApiProviders } from './providers';
import { evaluate } from './evaluator';
import {
  maybeReadConfig,
  readConfig,
  readPrompts,
  readTests,
  writeLatestResults,
  writeOutput,
} from './util';
import { DEFAULT_README, DEFAULT_YAML_CONFIG, DEFAULT_PROMPTS } from './onboarding';
import { disableCache } from './cache';
import { getDirectory } from './esm';
import { init } from './web/server';
import { checkForUpdates } from './updates';

import type {
  CommandLineOptions,
  EvaluateOptions,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types';

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
    logger.info('Wrote prompts.txt and promptfooconfig.js. Open README.md to get started!');
  } else {
    logger.info(`Wrote prompts.txt and promptfooconfig.js to ./${directory}`);
    logger.info(`\`cd ${directory}\` and open README.md to get started!`);
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
  let config: Partial<UnifiedConfig> = {};
  for (const path of potentialPaths) {
    const maybeConfig = await maybeReadConfig(path);
    if (maybeConfig) {
      config = maybeConfig;
      break;
    }
  }

  let evaluateOptions: EvaluateOptions = {};
  if (config.evaluateOptions) {
    evaluateOptions.generateSuggestions = config.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = config.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = config.evaluateOptions.showProgressBar;
  }

  const program = new Command();

  program.option('--version', 'Print version', () => {
    const packageJson = JSON.parse(
      readFileSync(pathJoin(getDirectory(), '../package.json'), 'utf8'),
    );
    console.log(packageJson.version);
    process.exit(0);
  });

  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .action(async (directory: string | null) => {
      createDummyFiles(directory);
      telemetry.record('command_used', {
        name: 'init',
      });
      await telemetry.send();
    });

  program
    .command('view')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .action(async (cmdObj: { port: number } & Command) => {
      telemetry.record('command_used', {
        name: 'view',
      });
      await telemetry.send();
      init(cmdObj.port);
    });

  program
    .command('eval')
    .description('Evaluate prompts')
    .requiredOption('-p, --prompts <paths...>', 'Paths to prompt files (.txt)', config.prompts)
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
      config?.commandLineOptions?.vars,
    )
    .option('-t, --tests <path>', 'Path to CSV with test cases', config?.commandLineOptions?.tests)
    .option('-o, --output <path>', 'Path to output file (csv, json, yaml, html)', config.outputPath)
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      config.evaluateOptions?.maxConcurrency
        ? String(config.evaluateOptions.maxConcurrency)
        : undefined,
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
      config.defaultTest?.options?.prefix,
    )
    .option(
      '--prompt-suffix <path>',
      'This suffix is append to every prompt',
      config.defaultTest?.options?.suffix,
    )
    .option(
      '--no-write',
      'Do not write results to promptfoo directory',
      config?.commandLineOptions?.write,
    )
    .option(
      '--no-cache',
      'Do not read or write results to disk cache',
      config?.commandLineOptions?.cache,
    )
    .option('--grader', 'Model that will grade outputs', config?.commandLineOptions?.grader)
    .option('--verbose', 'Show debug logs', config?.commandLineOptions?.verbose)
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
      const maxConcurrency = parseInt(cmdObj.maxConcurrency || '', 10);
      const configPath = cmdObj.config;
      if (configPath) {
        config = await readConfig(configPath);
      } else {
        config = {
          prompts: cmdObj.prompts || config.prompts,
          providers: cmdObj.providers || config.providers,
          tests: cmdObj.tests || cmdObj.vars || config.tests,
          defaultTest: config.defaultTest,
        };
      }

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
      const parsedPrompts = readPrompts(config.prompts);
      const parsedProviders = await loadApiProviders(config.providers);
      const parsedTests: TestCase[] = await readTests(config.tests);

      if (parsedPrompts.length === 0) {
        logger.error(chalk.red('No prompts found'));
        process.exit(1);
      }

      const defaultTest: TestCase = {
        options: {
          prefix: cmdObj.promptPrefix,
          suffix: cmdObj.promptSuffix,
          provider: cmdObj.grader,
          // rubricPrompt:
        },
        ...config.defaultTest,
      };

      const testSuite: TestSuite = {
        description: config.description,
        prompts: parsedPrompts,
        providers: parsedProviders,
        tests: parsedTests,
        defaultTest,
      };

      const options: EvaluateOptions = {
        showProgressBar: getLogLevel() !== 'debug',
        maxConcurrency: !isNaN(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : undefined,
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

      if (cmdObj.output) {
        logger.info(chalk.yellow(`Writing output to ${cmdObj.output}`));
        writeOutput(cmdObj.output, summary);
      } else if (getLogLevel() !== 'debug') {
        // Output table by default
        const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
        const head = summary.table.head;
        const headLength = head.prompts.length + head.vars.length;
        const table = new Table({
          head: [...head.prompts, ...head.vars],
          colWidths: Array(headLength).fill(Math.floor(maxWidth / headLength)),
          wordWrap: true,
          wrapOnWordBoundary: false,
          style: {
            head: ['blue', 'bold'],
          },
        });
        // Skip first row (header) and add the rest. Color PASS/FAIL
        for (const row of summary.table.body.slice(0, 25)) {
          table.push([
            ...row.vars,
            ...row.outputs.map((col) => {
              const tableCellMaxLength = parseInt(cmdObj.tableCellMaxLength || '', 10);
              if (!isNaN(tableCellMaxLength) && col.length > tableCellMaxLength) {
                col = col.slice(0, tableCellMaxLength) + '...';
              }
              if (col.startsWith('[PASS]')) {
                // color '[PASS]' green
                return chalk.green.bold(col.slice(0, 6)) + col.slice(6);
              } else if (col.startsWith('[FAIL]')) {
                // color everything red up until '---'
                return col
                  .split('---')
                  .map((c, idx) => (idx === 0 ? chalk.red.bold(c) : c))
                  .join('---');
              }
              return col;
            }),
          ]);
        }

        logger.info('\n' + table.toString());
        if (summary.table.body.length > 25) {
          const rowsLeft = summary.table.body.length - 25;
          logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
        }
      }

      const border = '='.repeat(process.stdout.columns - 10);
      logger.info(border);
      if (cmdObj.view || !cmdObj.write) {
        logger.info(`${chalk.green('✔')} Evaluation complete`);
      } else {
        writeLatestResults(summary, config);
        logger.info(
          `${chalk.green('✔')} Evaluation complete. To use web viewer, run ${chalk.green(
            'promptfoo view',
          )}`,
        );
      }
      logger.info(border);
      logger.info(chalk.green.bold(`Successes: ${summary.stats.successes}`));
      logger.info(chalk.red.bold(`Failures: ${summary.stats.failures}`));
      logger.info(
        `Token usage: Total ${summary.stats.tokenUsage.total}, Prompt ${summary.stats.tokenUsage.prompt}, Completion ${summary.stats.tokenUsage.completion}, Cached ${summary.stats.tokenUsage.cached}`,
      );
      logger.info('Done.');

      telemetry.record('command_used', {
        name: 'eval',
      });
      await telemetry.send();

      if (cmdObj.view) {
        init(parseInt(cmdObj.view, 10) || 15500);
      }
    });

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main();
