import chalk from 'chalk';
import type { Command } from 'commander';
import logger from '../logger';
import Eval, { EvalQueries } from '../models/eval';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { printBorder, setupEnv } from '../util';
import { sha256 } from '../util/createHash';
import { getPrompts, getTestCases } from '../util/database';

export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List various resources');

  listCommand
    .command('evals')
    .description('List evaluations')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of evaluations to display')
    .option('--ids-only', 'Only show evaluation IDs')
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

      const tableData = evals
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((evl) => {
          const prompts = evl.getPrompts();
          const description = evl.config.description || '';
          return {
            'eval id': evl.id,
            description: description.slice(0, 100) + (description.length > 100 ? '...' : ''),
            prompts: prompts.map((p) => sha256(p.raw).slice(0, 6)).join(', ') || '',
            vars: vars[evl.id]?.join(', ') || '',
          };
        });

      const columnWidths = {
        'eval id': 32,
        description: 25,
        prompts: 10,
        vars: 12,
      };

      logger.info(wrapTable(tableData, columnWidths) as string);
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
    .description('List prompts')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of prompts to display')
    .option('--ids-only', 'Only show prompt IDs')
    .action(async (cmdObj: { envPath?: string; n?: string; idsOnly?: boolean }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'list prompts',
      });
      await telemetry.send();

      const prompts = (await getPrompts(Number(cmdObj.n) || undefined)).sort((a, b) =>
        a.recentEvalId.localeCompare(b.recentEvalId),
      );

      if (cmdObj.idsOnly) {
        prompts.forEach((prompt) => logger.info(prompt.id));
        return;
      }

      const tableData = prompts.map((prompt) => ({
        'prompt id': prompt.id.slice(0, 6),
        raw: prompt.prompt.raw.slice(0, 100) + (prompt.prompt.raw.length > 100 ? '...' : ''),
        evals: prompt.count,
        'recent eval': prompt.recentEvalId,
      }));

      const columnWidths = {
        'prompt id': 12,
        raw: 30,
        evals: 8,
        'recent eval': 30,
      };

      logger.info(wrapTable(tableData, columnWidths) as string);
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
    .description('List datasets')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of datasets to display')
    .option('--ids-only', 'Only show dataset IDs')
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
        'dataset id': dataset.id.slice(0, 6),
        'best prompt':
          dataset.prompts.length > 0
            ? dataset.prompts
                .sort((a, b) => (b.prompt.metrics?.score || 0) - (a.prompt.metrics?.score || 0))[0]
                ?.id.slice(0, 6) || 'N/A'
            : 'N/A',
        evals: dataset.count,
        prompts: dataset.prompts.length,
        'recent eval': dataset.recentEvalId,
      }));

      const columnWidths = {
        'dataset id': 12,
        'best prompt': 15,
        evals: 8,
        prompts: 10,
        'recent eval': 30,
      };

      logger.info(wrapTable(tableData, columnWidths) as string);
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
