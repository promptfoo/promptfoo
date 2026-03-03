import chalk from 'chalk';
import logger from '../logger';
import Eval, { EvalQueries } from '../models/eval';
import { wrapTable } from '../table';
import {
  type DatasetItem,
  type EvalItem,
  type PromptItem,
  runInkList,
  shouldUseInkList,
} from '../ui/list';
import { sha256 } from '../util/createHash';
import { getPrompts, getTestCases } from '../util/database';
import { printBorder, setupEnv } from '../util/index';
import type { Command } from 'commander';

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

      // For --ids-only, fetch all at once (typically used in scripts)
      if (cmdObj.idsOnly) {
        const evals = await Eval.getMany(Number(cmdObj.n) || undefined);
        evals.forEach((evl) => logger.info(evl.id));
        return;
      }

      // Use Ink UI only if explicitly enabled via env var
      if (shouldUseInkList()) {
        const PAGE_SIZE = 50;
        const maxLimit = Number(cmdObj.n) || Infinity;

        // Helper to transform Eval objects to EvalItems
        const transformEvalsToItems = async (evals: Eval[]): Promise<EvalItem[]> => {
          const vars = await EvalQueries.getVarsFromEvals(evals);
          return evals.map((evl) => {
            const prompts = evl.getPrompts();
            const passCount = prompts.reduce((sum, p) => sum + (p.metrics?.testPassCount ?? 0), 0);
            const failCount = prompts.reduce((sum, p) => sum + (p.metrics?.testFailCount ?? 0), 0);
            const errorCount = prompts.reduce(
              (sum, p) => sum + (p.metrics?.testErrorCount ?? 0),
              0,
            );
            const testCount =
              prompts.length > 0
                ? (prompts[0].metrics?.testPassCount ?? 0) +
                  (prompts[0].metrics?.testFailCount ?? 0) +
                  (prompts[0].metrics?.testErrorCount ?? 0)
                : 0;

            // Extract provider IDs from config
            const configProviders = evl.config.providers;
            const providerIds: string[] = [];
            if (typeof configProviders === 'string') {
              providerIds.push(configProviders);
            } else if (Array.isArray(configProviders)) {
              for (const p of configProviders) {
                if (typeof p === 'string') {
                  providerIds.push(p);
                } else if (typeof p === 'object' && p) {
                  if ('id' in p && typeof p.id === 'string') {
                    providerIds.push(p.id);
                  } else {
                    const keys = Object.keys(p);
                    if (keys.length > 0 && !keys.includes('id')) {
                      providerIds.push(keys[0]);
                    }
                  }
                }
              }
            }

            return {
              id: evl.id,
              description: evl.config.description,
              prompts: prompts.map((p) => sha256(p.raw).slice(0, 6)),
              vars: vars[evl.id] || [],
              createdAt: new Date(evl.createdAt),
              isRedteam: Boolean(evl.config.redteam),
              passCount,
              failCount,
              errorCount,
              testCount,
              promptCount: prompts.length,
              providers: providerIds,
            };
          });
        };

        // Get total count for hasMore tracking
        const totalCount = await Eval.getCount();
        let loadedCount = 0;

        // Load first page
        const firstPageLimit = Math.min(PAGE_SIZE, maxLimit);
        const initialEvals = await Eval.getPaginated(0, firstPageLimit);
        const items = await transformEvalsToItems(initialEvals);
        loadedCount = items.length;

        const result = await runInkList({
          resourceType: 'evals',
          items,
          pageSize: PAGE_SIZE,
          hasMore: loadedCount < totalCount && loadedCount < maxLimit,
          totalCount,
          onLoadMore: async (offset: number, limit: number) => {
            // Respect user-provided limit
            const effectiveLimit = Math.min(limit, maxLimit - offset);
            if (effectiveLimit <= 0) {
              return [];
            }
            const evals = await Eval.getPaginated(offset, effectiveLimit);
            const newItems = await transformEvalsToItems(evals);
            loadedCount += newItems.length;
            return newItems;
          },
        });

        if (result.selectedItem) {
          const item = result.selectedItem as EvalItem;
          const total = (item.passCount ?? 0) + (item.failCount ?? 0) + (item.errorCount ?? 0);
          const hasResults = total > 0;

          logger.info('');
          logger.info(chalk.cyan.bold('─'.repeat(60)));

          // Title with type badge
          if (item.isRedteam) {
            logger.info(`${chalk.cyan.bold('Eval:')} ${item.id} ${chalk.red.bold('[RED TEAM]')}`);
          } else {
            logger.info(`${chalk.cyan.bold('Eval:')} ${item.id}`);
          }

          if (item.description) {
            logger.info(`${chalk.gray(item.description)}`);
          }

          logger.info(chalk.cyan.bold('─'.repeat(60)));

          // Status & Results
          if (hasResults) {
            const passRate = Math.round(((item.passCount ?? 0) / total) * 100);
            const color = passRate >= 80 ? chalk.green : passRate >= 50 ? chalk.yellow : chalk.red;
            logger.info(
              `${chalk.white('Results:')} ${color.bold(`${passRate}%`)} passed ${chalk.gray(`(${item.passCount}/${total})`)}`,
            );
            if (item.errorCount && item.errorCount > 0) {
              logger.info(
                `${chalk.red('Errors:')} ${item.errorCount} test${item.errorCount !== 1 ? 's' : ''} failed to run`,
              );
            }
          } else {
            logger.info(`${chalk.yellow('Status:')} No results yet`);
            if (item.testCount) {
              logger.info(
                `${chalk.gray('Configured:')} ${item.testCount} test${item.testCount !== 1 ? 's' : ''}`,
              );
            }
          }

          // Providers
          if (item.providers && item.providers.length > 0) {
            const providerList =
              item.providers.length <= 3
                ? item.providers.join(', ')
                : `${item.providers.slice(0, 3).join(', ')} +${item.providers.length - 3} more`;
            logger.info(`${chalk.white('Providers:')} ${chalk.gray(providerList)}`);
          }

          // Prompts & Vars
          if (item.promptCount && item.promptCount > 0) {
            logger.info(
              `${chalk.white('Prompts:')} ${item.promptCount}${item.vars.length > 0 ? chalk.gray(` × ${item.vars.length} var${item.vars.length !== 1 ? 's' : ''}`) : ''}`,
            );
          }

          // Timestamp
          const timeStr = item.createdAt.toLocaleString();
          logger.info(`${chalk.white('Created:')} ${chalk.gray(timeStr)}`);

          logger.info('');
          logger.info(chalk.white.bold('Actions:'));
          logger.info(`  ${chalk.green('promptfoo show eval ' + item.id)}`);
          logger.info(`    └─ View detailed results in terminal`);
          logger.info(`  ${chalk.green('promptfoo view --eval ' + item.id)}`);
          logger.info(`    └─ Open in browser`);
          logger.info('');
        }
        return;
      }

      // Non-interactive fallback - fetch all evals for table display
      const evals = await Eval.getMany(Number(cmdObj.n) || undefined);
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

      const prompts = (await getPrompts(Number(cmdObj.n) || undefined)).sort((a, b) =>
        a.recentEvalId.localeCompare(b.recentEvalId),
      );

      if (cmdObj.idsOnly) {
        prompts.forEach((prompt) => logger.info(prompt.id));
        return;
      }

      // Use Ink UI only if explicitly enabled via env var
      if (shouldUseInkList()) {
        const items: PromptItem[] = prompts.map((prompt) => ({
          id: prompt.id,
          raw: prompt.prompt.raw,
          evalCount: prompt.count,
          recentEvalId: prompt.recentEvalId,
        }));

        const result = await runInkList({
          resourceType: 'prompts',
          items,
        });

        if (result.selectedItem) {
          const item = result.selectedItem as PromptItem;
          logger.info('');
          logger.info(chalk.cyan.bold(`Prompt: ${item.id.slice(0, 8)}`));
          logger.info(`Used in: ${item.evalCount} evaluation${item.evalCount !== 1 ? 's' : ''}`);
          if (item.recentEvalId) {
            logger.info(`Most recent eval: ${item.recentEvalId}`);
          }
          // Show truncated preview of the prompt
          const preview =
            item.raw.length > 100 ? item.raw.slice(0, 100).replace(/\n/g, ' ') + '...' : item.raw;
          logger.info(`Preview: ${chalk.gray(preview)}`);
          logger.info('');
          logger.info(`View details: ${chalk.green(`promptfoo show prompt ${item.id}`)}`);
        }
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

      const datasets = (await getTestCases(Number(cmdObj.n) || undefined)).sort((a, b) =>
        b.recentEvalId.localeCompare(a.recentEvalId),
      );

      if (cmdObj.idsOnly) {
        datasets.forEach((dataset) => logger.info(dataset.id));
        return;
      }

      // Use Ink UI only if explicitly enabled via env var
      if (shouldUseInkList()) {
        const items: DatasetItem[] = datasets.map((dataset) => ({
          id: dataset.id,
          testCount: dataset.prompts.length,
          evalCount: dataset.count,
          bestPromptId:
            dataset.prompts.length > 0
              ? dataset.prompts.sort(
                  (a, b) => (b.prompt.metrics?.score || 0) - (a.prompt.metrics?.score || 0),
                )[0]?.id
              : undefined,
          recentEvalId: dataset.recentEvalId,
        }));

        const result = await runInkList({
          resourceType: 'datasets',
          items,
        });

        if (result.selectedItem) {
          const item = result.selectedItem as DatasetItem;
          logger.info('');
          logger.info(chalk.cyan.bold(`Dataset: ${item.id.slice(0, 8)}`));
          logger.info(`Test cases: ${item.testCount}`);
          logger.info(`Used in: ${item.evalCount} evaluation${item.evalCount !== 1 ? 's' : ''}`);
          if (item.bestPromptId) {
            logger.info(`Best performing prompt: ${item.bestPromptId.slice(0, 8)}`);
          }
          if (item.recentEvalId) {
            logger.info(`Most recent eval: ${item.recentEvalId}`);
          }
          logger.info('');
          logger.info(`View details: ${chalk.green(`promptfoo show dataset ${item.id}`)}`);
        }
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
