import { PromptWithMetadata } from '@promptfoo/types';
import chalk from 'chalk';
import type { Command } from 'commander';
import fetch from 'node-fetch';
import logger from '../logger';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { getEvals, getPrompts, getTestCases, printBorder, setupEnv } from '../util';
import { sha256 } from '../util/createHash';

export function listCommand(program: Command) {
  const listCommand = program.command('list').description('List various resources');

  listCommand
    .command('evals')
    .description('List evaluations.')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of evals to display')
    .action(async (cmdObj: { envPath?: string; n?: string }) => {
      setupEnv(cmdObj.envPath);
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
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of prompts to display')
    .option('--remote', 'Show remote prompts only')
    .option('--filter-label <regex>', 'Filter prompts by label')
    .option('--latest', 'Show only the latest version of each prompt')
    .action(
      async (cmdObj: {
        envPath?: string;
        n?: string;
        remote?: boolean;
        filterLabel?: string;
        latest?: boolean;
      }) => {
        setupEnv(cmdObj.envPath);
        telemetry.record('command_used', {
          name: 'list prompts',
          remote: cmdObj.remote || false,
          filterLabel: !!cmdObj.filterLabel,
          latest: cmdObj.latest || false,
        });
        await telemetry.send();

        let tableData: any[] = [];
        if (cmdObj.remote) {
          type RemotePrompt = {
            id: string;
            type: string;
            content: string;
            version: number;
            author: string;
            createdAt: string;
            labels?: string[];
          };
          let prompts: RemotePrompt[];
          try {
            const response = await fetch(
              // FIXME(ian): Use the right URL
              'http://localhost:15500/api/prompts?' +
                new URLSearchParams({
                  ...(cmdObj.n ? { limit: cmdObj.n } : {}),
                  ...(cmdObj.filterLabel ? { label: cmdObj.filterLabel } : {}),
                  latest: cmdObj.latest ? 'true' : 'false',
                }),
            );
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = (await response.json()) as { data: { prompts: RemotePrompt }[] };
            prompts = data.data.map((p) => p.prompts);
          } catch (error) {
            logger.error('Failed to fetch remote prompts:', error);
            process.exit(1);
          }
          prompts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          tableData = prompts.map((prompt) => ({
            'Prompt ID': prompt.id.slice(0, 6),
            Raw: prompt.content.slice(0, 100) + (prompt.content.length > 100 ? '...' : ''),
            Version: prompt.version,
            Labels: prompt.labels ? prompt.labels.join(', ') : '',
            'Created At': new Date(prompt.createdAt).toLocaleString(),
          }));
        } else {
          const prompts = await getPrompts(Number(cmdObj.n) || undefined);
          tableData = prompts.map((prompt) => ({
            'Prompt ID': prompt.id.slice(0, 6),
            Raw: prompt.prompt.raw.slice(0, 100) + (prompt.prompt.raw.length > 100 ? '...' : ''),
            '# evals': prompt.count,
            'Most recent eval': prompt.recentEvalId.slice(0, 6),
          }));
        }

        logger.info(wrapTable(tableData));
        printBorder();
        logger.info(
          `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
        );
      },
    );

  listCommand
    .command('datasets')
    .description('List datasets used')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-n <limit>', 'Number of datasets to display')
    .action(async (cmdObj: { envPath?: string; n?: string }) => {
      setupEnv(cmdObj.envPath);
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
