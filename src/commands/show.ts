import chalk from 'chalk';
import logger from '../logger';
import Eval from '../models/eval';
import { generateTable, wrapTable } from '../table';
import { getDatasetFromHash, getEvalFromId, getPromptFromHash } from '../util/database';
import { printBorder, setupEnv } from '../util/index';
import invariant from '../util/invariant';
import type { Command } from 'commander';

type CountMetrics = {
  testPassCount?: number;
  testFailCount?: number;
  testErrorCount?: number;
};

function formatPassCount(metrics?: CountMetrics) {
  if (!metrics) {
    return '-';
  }
  return String(metrics.testPassCount ?? 0);
}

function formatFailCount(metrics?: CountMetrics) {
  if (!metrics) {
    return '-';
  }
  const failCount = metrics.testFailCount ?? 0;
  const errorCount = metrics.testErrorCount ?? 0;
  if (errorCount > 0) {
    return `${failCount} (+${errorCount} errors)`;
  }
  return String(failCount);
}

export async function handlePrompt(id: string) {
  const prompt = await getPromptFromHash(id);
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
      'Raw score': evl.metrics?.score?.toFixed(2) || '-',
      'Pass rate':
        evl.metrics &&
        evl.metrics.testPassCount + evl.metrics.testFailCount + evl.metrics.testErrorCount > 0
          ? `${(
              (evl.metrics.testPassCount /
                (evl.metrics.testPassCount +
                  evl.metrics.testFailCount +
                  evl.metrics.testErrorCount)) *
                100
            ).toFixed(2)}%`
          : '-',
      'Pass count': formatPassCount(evl.metrics),
      'Fail count': formatFailCount(evl.metrics),
    });
  }
  logger.info(wrapTable(table) as string);
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show dataset <id>')} to see details of a specific dataset.`,
  );
}

export async function handleEval(id: string) {
  const eval_ = await Eval.findById(id);
  if (!eval_) {
    logger.error(`No evaluation found with ID ${id}`);
    process.exitCode = 1;
    return;
  }
  const table = await eval_.getTable();
  invariant(table, 'Could not generate table');
  const { prompts, vars } = table.head;

  logger.info(generateTable(table, 100, 25));
  if (table.body.length > 25) {
    const rowsLeft = table.body.length - 25;
    logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
  }

  printBorder();
  logger.info(chalk.cyan(`Eval ${id}`));
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
  const dataset = await getDatasetFromHash(id);
  if (!dataset) {
    logger.error(`Dataset with ID ${id} not found.`);
    process.exitCode = 1;
    return;
  }

  printBorder();
  logger.info(chalk.bold(`Dataset ${id}`));
  printBorder();

  logger.info(`This dataset is used in the following evals:`);
  const table = [];
  for (const prompt of dataset.prompts
    .sort((a, b) => b.evalId.localeCompare(a.evalId))
    .slice(0, 10)) {
    table.push({
      'Eval ID': prompt.evalId.slice(0, 6),
      'Prompt ID': prompt.id.slice(0, 6),
      'Raw score': prompt.prompt.metrics?.score?.toFixed(2) || '-',
      'Pass rate':
        prompt.prompt.metrics &&
        prompt.prompt.metrics.testPassCount +
          prompt.prompt.metrics.testFailCount +
          prompt.prompt.metrics.testErrorCount >
          0
          ? `${(
              (prompt.prompt.metrics.testPassCount /
                (prompt.prompt.metrics.testPassCount +
                  prompt.prompt.metrics.testFailCount +
                  prompt.prompt.metrics.testErrorCount)) *
                100
            ).toFixed(2)}%`
          : '-',
      'Pass count': formatPassCount(prompt.prompt.metrics),
      'Fail count': formatFailCount(prompt.prompt.metrics),
    });
  }
  logger.info(wrapTable(table) as string);
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
}

export async function showCommand(program: Command) {
  const showCommand = program
    .command('show [id]')
    .description('Show details of a specific resource (defaults to most recent)')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string | undefined, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      if (!id) {
        const latestEval = await Eval.latest();
        if (latestEval) {
          return handleEval(latestEval.id);
        }
        logger.error('No eval found');
        process.exitCode = 1;
        return;
      }

      const evl = await getEvalFromId(id);
      if (evl) {
        return handleEval(id);
      }

      const prompt = await getPromptFromHash(id);
      if (prompt) {
        return handlePrompt(id);
      }

      const dataset = await getDatasetFromHash(id);
      if (dataset) {
        return handleDataset(id);
      }

      logger.error(`No resource found with ID ${id}`);
      process.exitCode = 1;
    });

  showCommand
    .command('eval [id]')
    .description('Show details of a specific evaluation (defaults to most recent)')
    .action(async (id?: string) => {
      if (!id) {
        const latestEval = await Eval.latest();
        if (latestEval) {
          return handleEval(latestEval.id);
        }
        logger.error('No eval found');
        process.exitCode = 1;
        return;
      }
      return handleEval(id);
    });

  showCommand
    .command('prompt <id>')
    .description('Show details of a specific prompt')
    .action(handlePrompt);

  showCommand
    .command('dataset <id>')
    .description('Show details of a specific dataset')
    .action(handleDataset);
}
