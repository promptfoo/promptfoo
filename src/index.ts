#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';

import logger from './logger.js';
import { EvaluationOptions } from './types.js';
import { loadApiProvider } from './providers.js';
import { evaluate } from './evaluator.js';

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
  .action(async (cmdObj: EvaluationOptions & Command) => {
    const options: EvaluationOptions = {
      prompts: cmdObj.prompts,
      output: cmdObj.output,
      provider: cmdObj.provider,
      vars: cmdObj.vars,
    };

    const provider = loadApiProvider(options.provider);
    const results = await evaluate(options, provider);
    logger.info(chalk.green.bold(`Evaluation complete: ${JSON.stringify(results, null, 2)}`));
    logger.info('Done.');
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
