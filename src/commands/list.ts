import chalk from 'chalk';
import type { Command } from 'commander';
import logger from '../logger';
import Eval, { EvalQueries } from '../models/eval';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { getPrompts, getTestCases, printBorder, setupEnv } from '../util';
import { sha256 } from '../util/createHash';

export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List various resources');

  listCommand
    .command('evals')
    .description('List evaluations.')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of evals to display')
    .option('--ids-only', 'Show only eval IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'list evals',
      });
      await telemetry.send();

      const evals = await Eval.getMany(Number(cmdObj.n) || undefined);

      if (cmdObj.idsOnly) {
        evals.forEach((evl) => logger.info(evl.id));
        return;
      }

      const vars = await EvalQueries.getVarsFromEvals(evals);

      const tableData = evals.map((evl) => {
        const prompts = evl.getPrompts();
        const description = evl.config.description || '';
        return {
          'Eval ID': evl.id,
          Description: description.slice(0, 100) + (description.length > 100 ? '...' : ''),
          Prompts: prompts.map((p) => sha256(p.raw).slice(0, 6)).join(', ') || '',
          Vars: vars[evl.id]?.join(', ') || '',
        };
      });

      logger.info(wrapTable(tableData) as string);
      printBorder();

      logger.info(
        `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
      );
      logger.info(
        `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
      );
    });

  listCommand
    .command('prompts')
    .description('List prompts used')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of prompts to display')
    .option('--ids-only', 'Show only prompt IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'list prompts',
      });
      await telemetry.send();

      const prompts = (await getPrompts(Number(cmdObj.n) || undefined)).sort((a, b) =>
        b.recentEvalId.localeCompare(a.recentEvalId),
      );

      if (cmdObj.idsOnly) {
        prompts.forEach((prompt) => logger.info(prompt.id));
        return;
      }

      const tableData = prompts.map((prompt) => ({
        'Prompt ID': prompt.id.slice(0, 6),
        Raw: prompt.prompt.raw.slice(0, 100) + (prompt.prompt.raw.length > 100 ? '...' : ''),
        '# evals': prompt.count,
        'Most recent eval': prompt.recentEvalId.slice(0, 6),
      }));

      logger.info(wrapTable(tableData) as string);
      printBorder();
      logger.info(
        `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
      );
      logger.info(
        `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
      );
    });

  listCommand
    .command('datasets')
    .description('List datasets used')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of datasets to display')
    .option('--ids-only', 'Show only dataset IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'list datasets',
      });
      await telemetry.send();

      const datasets = (await getTestCases(Number(cmdObj.n) || undefined)).sort((a, b) =>
        b.recentEvalId.localeCompare(a.recentEvalId),
      );

      if (cmdObj.idsOnly) {
        datasets.forEach((dataset) => logger.info(dataset.id));
        return;
      }

      const tableData = datasets.map((dataset) => ({
        'Dataset ID': dataset.id.slice(0, 6),
        'Highest scoring prompt': dataset.prompts
          .sort((a, b) => (b.prompt.metrics?.score || 0) - (a.prompt.metrics?.score || 0))[0]
          .id.slice(0, 6),
        '# evals': dataset.count,
        '# prompts': dataset.prompts.length,
        'Most recent eval': dataset.recentEvalId.slice(0, 6),
      }));

      logger.info(wrapTable(tableData) as string);
      printBorder();
      logger.info(
        `Run ${chalk.green('promptfoo show dataset <id>')} to see details of a specific dataset.`,
      );
      logger.info(
        `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
      );
      logger.info(
        `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
      );
    });
}
