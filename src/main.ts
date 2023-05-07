#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { parse, join as pathJoin } from 'path';

import Table from 'cli-table3';
import chalk from 'chalk';
import { Command } from 'commander';

import logger, { setLogLevel } from './logger.js';
import { loadApiProvider } from './providers.js';
import { evaluate } from './evaluator.js';
import { readPrompts, readVars, writeOutput } from './util.js';
import { getDirectory } from './esm.js';

import type { CommandLineOptions, EvaluateOptions, VarMapping } from './types.js';

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
  const dummyConfig = `export default {
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
  let defaultConfig: Partial<CommandLineOptions> = {};
  if (existsSync('promptfooconfig.js')) {
    // @ts-ignore
    defaultConfig = (await import(pathJoin(process.cwd(), './promptfooconfig.js'))).default;
    logger.info('Loaded default config from promptfooconfig.js');
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
    .command('eval')
    .description('Evaluate prompts')
    .requiredOption(
      '-p, --prompts <paths...>',
      'Paths to prompt files (.txt)',
      defaultConfig.prompts,
    )
    .requiredOption(
      '-r, --providers <name or path...>',
      'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
      defaultConfig.providers,
    )
    .option(
      '-o, --output <path>',
      'Path to output file (csv, json, yaml, html)',
      defaultConfig.output,
    )
    .option(
      '-v, --vars <path>',
      'Path to file with prompt variables (csv, json, yaml)',
      defaultConfig.vars,
    )
    .option(
      '-c, --config <path>',
      'Path to configuration file. Automatically loads promptfooconfig.js',
      defaultConfig.config,
    )
    .option(
      '-j, --max-concurrency <number>',
      'Maximum number of concurrent API calls',
      String(defaultConfig.maxConcurrency),
    )
    .option('--grader', 'Model that will grade outputs', defaultConfig.grader)
    .option('--verbose', 'Show debug logs', defaultConfig.verbose)
    .action(async (cmdObj: CommandLineOptions & Command) => {
      if (cmdObj.verbose) {
        setLogLevel('debug');
      }

      const configPath = cmdObj.config;
      let config = {};
      if (configPath) {
        const ext = parse(configPath).ext;
        switch (ext) {
          case '.json':
            const content = readFileSync(configPath, 'utf-8');
            config = JSON.parse(content);
            break;
          case '.js':
            config = require(configPath);
            break;
          default:
            throw new Error(`Unsupported configuration file format: ${ext}`);
        }
      }

      let vars: VarMapping[] = [];
      if (cmdObj.vars) {
        vars = readVars(cmdObj.vars);
      }

      const providers = await Promise.all(
        cmdObj.providers.map(async (p) => await loadApiProvider(p)),
      );
      const options: EvaluateOptions = {
        prompts: readPrompts(cmdObj.prompts),
        vars,
        providers,
        showProgressBar: true,
        maxConcurrency:
          cmdObj.maxConcurrency && cmdObj.maxConcurrency > 0 ? cmdObj.maxConcurrency : undefined,
        ...config,
      };

      if (cmdObj.grader) {
        options.grading = {
          provider: await loadApiProvider(cmdObj.grader),
        };
      }

      const summary = await evaluate(options);

      if (cmdObj.output) {
        logger.info(chalk.yellow(`Writing output to ${cmdObj.output}`));
        writeOutput(cmdObj.output, summary);
      } else {
        // Output table by default
        const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
        const head = summary.table[0];
        const table = new Table({
          head,
          colWidths: Array(head.length).fill(Math.floor(maxWidth / head.length)),
          wordWrap: true,
          wrapOnWordBoundary: true,
          style: {
            head: ['blue', 'bold'],
          },
        });
        // Skip first row (header) and add the rest. Color PASS/FAIL
        for (const row of summary.table.slice(1)) {
          table.push(
            row.map((col) => {
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
          );
        }

        logger.info('\n' + table.toString());
      }
      logger.info('Evaluation complete');
      logger.info(chalk.green.bold(`Successes: ${summary.stats.successes}`));
      logger.info(chalk.red.bold(`Failures: ${summary.stats.failures}`));
      logger.info(
        `Token usage: Total ${summary.stats.tokenUsage.total} Prompt ${summary.stats.tokenUsage.prompt} Completion ${summary.stats.tokenUsage.completion}`,
      );
      logger.info('Done.');
    });

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main();
