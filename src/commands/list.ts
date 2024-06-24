import chalk from 'chalk';
import { Command } from 'commander';
import logger from '../logger';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { getEvals, getPrompts, getTestCases, printBorder, setupEnv, sha256 } from '../util';

export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List various resources');

  listCommand
    .command('evals')
    .description('List evaluations.')
    .option('--env-path <path>', 'Path to the environment file')
    .option('-n <limit>', 'Number of evals to display')
    .action(async (cmdObj: { envPath?: string; n?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'list evals',
      });
      await telemetry.send();

      const evals = await getEvals(Number(cmdObj.n) || undefined);
      const tableData = evals.map((evl) => ({
        'Eval ID': evl.id,
        Description: evl.description || '',
        Prompts: evl.results.table.head.prompts.map((p) => sha256(p.raw).slice(0, 6)).join(', '),
        Vars: evl.results.table.head.vars.map((v) => v).join(', '),
      }));

      logger.info(wrapTable(tableData));
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
    .option('--env-path <path>', 'Path to the environment file')
    .option('-n <limit>', 'Number of prompts to display')
    .action(async (cmdObj: { envPath?: string; n?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'list prompts',
      });
      await telemetry.send();

      const prompts = (await getPrompts(Number(cmdObj.n) || undefined)).sort((a, b) =>
        b.recentEvalId.localeCompare(a.recentEvalId),
      );
      const tableData = prompts.map((prompt) => ({
        'Prompt ID': prompt.id.slice(0, 6),
        Raw: prompt.prompt.raw.slice(0, 100) + (prompt.prompt.raw.length > 100 ? '...' : ''),
        '# evals': prompt.count,
        'Most recent eval': prompt.recentEvalId.slice(0, 6),
      }));

      logger.info(wrapTable(tableData));
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
    .option('--env-path <path>', 'Path to the environment file')
    .option('-n <limit>', 'Number of datasets to display')
    .action(async (cmdObj: { envPath?: string; n?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'list datasets',
      });
      await telemetry.send();

      const datasets = (await getTestCases(Number(cmdObj.n) || undefined)).sort((a, b) =>
        b.recentEvalId.localeCompare(a.recentEvalId),
      );
      const tableData = datasets.map((dataset) => ({
        'Dataset ID': dataset.id.slice(0, 6),
        'Highest scoring prompt': dataset.prompts
          .sort((a, b) => (b.prompt.metrics?.score || 0) - (a.prompt.metrics?.score || 0))[0]
          .id.slice(0, 6),
        '# evals': dataset.count,
        '# prompts': dataset.prompts.length,
        'Most recent eval': dataset.recentEvalId.slice(0, 6),
      }));

      logger.info(wrapTable(tableData));
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
