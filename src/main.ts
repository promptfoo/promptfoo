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

    const providers = cmdObj.provider.map((p) => loadApiProvider(p));
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
      writeOutput(cmdObj.output, summary.results, summary.table);
    } else {
      // Output table by default
      const maxWidth = process.stdout.columns ? process.stdout.columns - 10 : 120;
      const head = summary.table[0];
      const table = new Table({
        head,
        colWidths: Array(head.length).fill(Math.floor(maxWidth / head.length)),
        wordWrap: true,
        wrapOnWordBoundary: true,
      });
      table.push(...summary.table.slice(1));
      logger.info('\n' + table.toString());
    }
    logger.info(chalk.green.bold(`Evaluation complete: ${JSON.stringify(summary.stats, null, 2)}`));
    logger.info('Done.');
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
