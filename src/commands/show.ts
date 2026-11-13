import chalk from 'chalk';
import logger from '../logger';
import Eval from '../models/eval';
import { generateTable, wrapTable } from '../table';
import { getDatasetFromHash, getPromptFromHash, hasRecentEvalWithIdPrefix } from '../util/database';
import { printBorder, setupEnv } from '../util/index';
import type { Command } from 'commander';

type MatchedPrompt = NonNullable<Awaited<ReturnType<typeof getPromptFromHash>>>;

function formatMetrics(metrics: MatchedPrompt['evals'][number]['metrics']) {
  const rawScore = metrics?.score?.toFixed(2) || '-';
  const passRate =
    metrics && metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount > 0
      ? `${(
          (metrics.testPassCount /
            (metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount)) *
            100
        ).toFixed(2)}%`
      : '-';
  const passCount = metrics ? String(metrics.testPassCount ?? 0) : '-';
  const failCount = metrics?.testFailCount ?? 0;
  const errorCount = metrics?.testErrorCount ?? 0;
  return {
    'Raw score': rawScore,
    'Pass rate': passRate,
    'Pass count': passCount,
    'Fail count':
      errorCount > 0 ? `${failCount} (+${errorCount} errors)` : metrics ? String(failCount) : '-',
  };
}

export async function handlePrompt(id: string) {
  return showPrompt(id, await getPromptFromHash(id));
}

function showPrompt(id: string, prompt: MatchedPrompt | undefined) {
  if (!prompt) {
    logger.error(`Prompt with ID ${id} not found.`);
    process.exitCode = 1;
    return;
  }

  printBorder();
  logger.info(chalk.cyan(prompt.prompt.raw));
  printBorder();
  logger.info(chalk.bold(`Prompt ${id}`));
  printBorder();

  logger.info(`This prompt is used in the following evals:`);
  const table = [];
  for (const evl of prompt.evals.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10)) {
    table.push({
      'Eval ID': evl.id.slice(0, 6),
      'Dataset ID': evl.datasetId.slice(0, 6),
      ...formatMetrics(evl.metrics),
    });
  }
  logger.info(wrapTable(table) as string);
  printBorder();
  printResourceHint('eval');
  printResourceHint('dataset');
}

export async function handleEval(id?: string) {
  const eval_ = id === undefined ? await Eval.latest() : await Eval.findById(id);
  if (!eval_) {
    if (id === undefined) {
      logger.error('No eval found');
      logger.info(`Run ${chalk.green('promptfoo eval')} to create one.`);
    } else {
      logger.error(`No evaluation found with ID ${id}`);
      logger.info(`Run ${chalk.green('promptfoo list evals')} to see available evaluation IDs.`);
    }
    process.exitCode = 1;
    return;
  }
  const table = await eval_.getTable();
  const { prompts, vars } = table.head;

  logger.info(generateTable(table, 100, 25));
  if (table.body.length > 25) {
    const rowsLeft = table.body.length - 25;
    logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
  }

  printBorder();
  logger.info(chalk.cyan(`Eval ${eval_.id}`));
  printBorder();
  logger.info(`${prompts.length} prompts`);
  const promptIds = prompts
    .map((prompt) => prompt.id)
    .filter((promptId): promptId is string => Boolean(promptId));
  if (promptIds.length > 0) {
    const uniquePromptIds = [...new Set(promptIds)];
    const previewCount = 5;
    const previewIds = uniquePromptIds.slice(0, previewCount);
    logger.info(
      `Prompt IDs: ${previewIds.join(', ')}${
        uniquePromptIds.length > previewCount
          ? ` (and ${uniquePromptIds.length - previewCount} more...)`
          : ''
      }`,
    );
  }
  logger.info(
    `${vars.length} variables: ${vars.slice(0, 5).join(', ')}${
      vars.length > 5 ? ` (and ${vars.length - 5} more...)` : ''
    }`,
  );
}

export async function handleDataset(id: string) {
  return showDataset(id, await getDatasetFromHash(id));
}

function showDataset(id: string, dataset: Awaited<ReturnType<typeof getDatasetFromHash>>) {
  if (!dataset) {
    logger.error(`Dataset with ID ${id} not found.`);
    process.exitCode = 1;
    return;
  }

  printBorder();
  logger.info(chalk.bold(`Dataset ${id}`));
  printBorder();

  logger.info(`This dataset is used in the following evals:`);
  const table = dataset.prompts
    .sort((a, b) => b.evalId.localeCompare(a.evalId))
    .slice(0, 10)
    .map((prompt) => ({
      'Eval ID': prompt.evalId.slice(0, 6),
      'Prompt ID': prompt.id.slice(0, 6),
      ...formatMetrics(prompt.prompt.metrics),
    }));
  logger.info(wrapTable(table) as string);
  printBorder();
  printResourceHint('prompt');
  printResourceHint('eval');
}

export async function showCommand(program: Command) {
  const showCommand = program
    .command('show [id]')
    .description('Show details of a specific resource (defaults to most recent)')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string | undefined, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      if (!id) {
        return handleEval();
      }

      if (await hasRecentEvalWithIdPrefix(id)) {
        return handleEval(id);
      }

      const prompt = await getPromptFromHash(id);
      if (prompt) {
        return showPrompt(id, prompt);
      }

      const dataset = await getDatasetFromHash(id);
      if (dataset) {
        return showDataset(id, dataset);
      }

      logger.error(`No resource found with ID ${id}`);
      logger.info(
        `Run ${chalk.green('promptfoo list evals')}, ${chalk.green('promptfoo list prompts')}, or ${chalk.green('promptfoo list datasets')} to see available IDs.`,
      );
      process.exitCode = 1;
    });

  showCommand
    .command('eval [id]')
    .description('Show details of a specific evaluation (defaults to most recent)')
    .action((id?: string) => handleEval(id || undefined));

  showCommand
    .command('prompt <id>')
    .description('Show details of a specific prompt')
    .action(handlePrompt);

  showCommand
    .command('dataset <id>')
    .description('Show details of a specific dataset')
    .action(handleDataset);
}

export function printResourceHint(resource: 'eval' | 'prompt' | 'dataset') {
  logger.info(
    `Run ${chalk.green(`promptfoo show ${resource} <id>`)} to see details of a specific ${resource === 'eval' ? 'evaluation' : resource}.`,
  );
}
