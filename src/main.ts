#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join as pathJoin } from 'path';

import Table from 'cli-table3';
import chalk from 'chalk';
import invariant from 'tiny-invariant';
import yaml from 'js-yaml';
import { Command } from 'commander';

import logger, { setLogLevel } from './logger.js';
import { loadApiProvider, loadApiProviders } from './providers.js';
import { evaluate } from './evaluator.js';
import {
  maybeReadConfig,
  readConfig,
  readPrompts,
  readTests,
  readVars,
  testCaseFromCsvRow,
  writeLatestResults,
  writeOutput,
} from './util.js';
import { getDirectory } from './esm.js';
import { init } from './web/server.js';
import { assertionFromString } from './assertions.js';
import { disableCache } from './cache.js';

import type {
  ApiProvider,
  CommandLineOptions,
  EvaluateOptions,
  TestCase,
  TestSuite,
  UnifiedConfig,
  VarMapping,
} from './types.js';

function createDummyFiles(directory: string | null) {
  if (directory) {
    // Make the directory if it doesn't exist
    if (!existsSync(directory)) {
      mkdirSync(directory);
    }
  }
  const dummyPrompts = `Your first prompt goes here
---
Next prompt goes here. You can substitute variables like this: {{var1}} {{var2}} {{var3}}
---
This is the next prompt.

These prompts are nunjucks templates, so you can use logic like this:
{% if var1 %}
  {{ var1 }}
{% endif %}`;
  const dummyVars =
    'var1,var2,var3\nvalue1,value2,value3\nanother value1,another value2,another value3';
  const dummyConfig = `module.exports = {
  prompts: ['prompts.txt'],
  providers: ['openai:gpt-3.5-turbo'],
  vars: 'vars.csv',
  maxConcurrency: 4,
};`;
  const readme = `To get started, set your OPENAI_API_KEY environment variable. Then run:
\`\`\`
promptfoo eval
\`\`\`

You'll probably want to change a few of the prompts in prompts.txt and the variables in vars.csv before letting it rip.
`;

  if (directory) {
    if (!existsSync(directory)) {
      logger.info(`Creating directory ${directory} ...`);
      mkdirSync(directory);
    }
  } else {
    directory = '.';
  }

  writeFileSync(pathJoin(process.cwd(), directory, 'prompts.txt'), dummyPrompts);
  writeFileSync(pathJoin(process.cwd(), directory, 'vars.csv'), dummyVars);
  writeFileSync(pathJoin(process.cwd(), directory, 'promptfooconfig.js'), dummyConfig);
  writeFileSync(pathJoin(process.cwd(), directory, 'README.md'), readme);

  if (directory === '.') {
    logger.info(
      'Wrote prompts.txt, vars.csv, and promptfooconfig.js. Open README.md to get started!',
    );
  } else {
    logger.info(`Wrote prompts.txt, vars.csv, and promptfooconfig.js to ${directory}`);
    logger.info(`\`cd ${directory}\` and open README.md to get started!`);
  }
}

async function main() {
  const pwd = process.cwd();
  const potentialPaths = [
    pathJoin(pwd, 'promptfooconfig.js'),
    pathJoin(pwd, 'promptfooconfig.json'),
    pathJoin(pwd, 'promptfooconfig.yaml'),
  ];
  let config: Partial<UnifiedConfig> = {};
  for (const path of potentialPaths) {
    const maybeConfig = maybeReadConfig(path);
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
    .action((directory: string | null) => {
      createDummyFiles(directory);
    });

  program
    .command('view')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .action((cmdObj: { port: number } & Command) => {
      init(cmdObj.port);
    });

  program
    .command('eval')
    .description('Evaluate prompts')
    .requiredOption('-p, --prompts <paths...>', 'Paths to prompt files (.txt)', config.prompts)
    .requiredOption(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
      config?.providers,
    )
    .option(
      '-c, --config <path>',
      'Path to configuration file. Automatically loads promptfooconfig.js/json/yaml',
    )
    .option(
      '-v, --vars, --test-csv <path>',
      'Path to CSV with test cases',
      config?.commandLineOptions?.vars,
    )
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
      config.defaultProperties?.prompt?.prefix,
    )
    .option(
      '--prompt-suffix <path>',
      'This suffix is append to every prompt',
      config.defaultProperties?.prompt?.suffix,
    )
    .option('--no-write', 'Do not write results to promptfoo directory')
    .option('--no-cache', 'Do not read or write results to disk cache')
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
        config = readConfig(configPath);
      } else {
        config = {
          prompts: cmdObj.prompts || config.prompts,
          providers: cmdObj.providers || config.providers,
          tests: cmdObj.vars || config.tests,
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
      const parsedTests: TestCase[] = readTests(config.tests);

      if (parsedPrompts.length === 0) {
        logger.error(chalk.red('No prompts found'));
        process.exit(1);
      }

      const testSuite: TestSuite = {
        prompts: parsedPrompts,
        providers: parsedProviders,
        tests: parsedTests,
        defaultProperties: {
          prompt: {
            prefix: cmdObj.promptPrefix,
            suffix: cmdObj.promptSuffix,
          },
        },
      };

      const options: EvaluateOptions = {
        showProgressBar: true,
        maxConcurrency: !isNaN(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : undefined,
        ...evaluateOptions,
      };

      if (cmdObj.grader) {
        testSuite.defaultProperties!.grading = {
          provider: await loadApiProvider(cmdObj.grader),
        };
      }
      if (cmdObj.generateSuggestions) {
        options.generateSuggestions = true;
      }

      const summary = await evaluate(testSuite, options);

      if (cmdObj.output) {
        logger.info(chalk.yellow(`Writing output to ${cmdObj.output}`));
        writeOutput(cmdObj.output, summary);
      } else {
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
        for (const row of summary.table.body) {
          table.push([
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
            ...row.vars,
          ]);
        }

        logger.info('\n' + table.toString());
      }
      if (cmdObj.view || !cmdObj.write) {
        logger.info('Evaluation complete');
      } else {
        writeLatestResults(summary);
        logger.info(`Evaluation complete. To use web viewer, run ${chalk.green('promptfoo view')}`);
      }
      logger.info(chalk.green.bold(`Successes: ${summary.stats.successes}`));
      logger.info(chalk.red.bold(`Failures: ${summary.stats.failures}`));
      logger.info(
        `Token usage: Total ${summary.stats.tokenUsage.total}, Prompt ${summary.stats.tokenUsage.prompt}, Completion ${summary.stats.tokenUsage.completion}, Cached ${summary.stats.tokenUsage.cached}`,
      );
      logger.info('Done.');

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
