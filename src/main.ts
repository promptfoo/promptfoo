#!/usr/bin/env node
import { readFileSync } from 'fs';
import { parse } from 'path';

import chalk from 'chalk';
import { Command } from 'commander';

import logger from './logger.js';
import { loadApiProvider } from './providers.js';
import { evaluate } from './evaluator.js';
import { readPrompts, readVars, writeOutput } from './util.js';

import type { CommandLineOptions, EvaluateOptions, VarMapping } from './types.js';

const program = new Command();

program
  .command('eval')
  .description('Evaluate prompts')
  .requiredOption('-p, --prompts <paths...>', 'Paths to prompt files')
  .requiredOption('-o, --output <path>', 'Path to output CSV file')
  .requiredOption(
    '-r, --provider <name or path>',
    'One of: openai:chat, openai:completion, openai:<model name>, or path to custom API caller module',
  )
  .option('-v, --vars <path>', 'Path to CSV file with prompt variables')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (cmdObj: CommandLineOptions & Command) => {
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

    const options: EvaluateOptions = {
      prompts: readPrompts(cmdObj.prompts),
      vars,
      ...config,
    };

    const provider = loadApiProvider(cmdObj.provider);
    const summary = await evaluate(options, provider);

    logger.info(chalk.yellow.bold(`Writing output to ${cmdObj.output}`));
    writeOutput(cmdObj.output, summary.results);
    logger.info(chalk.green.bold(`Evaluation complete: ${JSON.stringify(summary.stats, null, 2)}`));
    logger.info('Done.');
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
