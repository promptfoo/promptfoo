#!/usr/bin/env node
import { readFileSync } from 'fs';
import { parse } from 'path';

import Table from 'cli-table3';
import chalk from 'chalk';
import { Command } from 'commander';

import logger, { setLogLevel } from './logger.js';
import { loadApiProvider } from './providers.js';
import { evaluate } from './evaluator.js';
import { readPrompts, readVars, writeOutput } from './util.js';

import type { CommandLineOptions, EvaluateOptions, VarMapping } from './types.js';

const program = new Command();

program
  .command('eval')
  .description('Evaluate prompts')
  .requiredOption('-p, --prompt <paths...>', 'Paths to prompt files (.txt)')
  .requiredOption(
    '-r, --provider <name or path...>',
    'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
  )
  .option('-o, --output <path>', 'Path to output file (csv, json, yaml, html)')
  .option('-v, --vars <path>', 'Path to file with prompt variables (csv, json, yaml)')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls')
  .option('--verbose', 'Show debug logs')
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

    const providers = await Promise.all(cmdObj.provider.map(async (p) => await loadApiProvider(p)));
    const options: EvaluateOptions = {
      prompts: readPrompts(cmdObj.prompt),
      vars,
      providers,
      showProgressBar: true,
      maxConcurrency:
        cmdObj.maxConcurrency && cmdObj.maxConcurrency > 0 ? cmdObj.maxConcurrency : undefined,
      ...config,
    };

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
      // Skip first row (header) and add the rest. Color the first column green if it's a success, red if it's a failure.
      for (const row of summary.table.slice(1)) {
        const color = row[0] === 'PASS' ? 'green' : row[0].startsWith('FAIL') ? 'red' : undefined;
        table.push(row.map((col, i) => (i === 0 && color ? chalk[color](col) : col)));
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
