import chalk from 'chalk';
import { Command } from 'commander';

import {
  getEvalFromId,
  getPromptFromHash,
  getDatasetFromHash,
  printBorder,
  setupEnv,
} from '../util';
import { generateTable, wrapTable } from '../table';
import logger from '../logger';
import telemetry from '../telemetry';

export async function showCommand(program: Command) {
  const showCommand = program
    .command('show <id>')
    .description('Show details of a specific resource')
    .option('--env-path <path>', 'Path to the environment file')
    .action(async (id: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'show',
      });

      await telemetry.send();
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
    });

  showCommand
    .command('eval <id>')
    .description('Show details of a specific evaluation')
    .action(handleEval);

  showCommand
    .command('prompt <id>')
    .description('Show details of a specific prompt')
    .action(handlePrompt);

  showCommand
    .command('dataset <id>')
    .description('Show details of a specific dataset')
    .action(handleDataset);
}

async function handleEval(id: string) {
  telemetry.maybeShowNotice();
  telemetry.record('command_used', {
    name: 'show eval',
  });
  await telemetry.send();

  const evl = await getEvalFromId(id);
  if (!evl) {
    logger.error(`No evaluation found with ID ${id}`);
    return;
  }

  const { prompts, vars } = evl.results.table.head;
  logger.info(generateTable(evl.results, 100, 25));
  if (evl.results.table.body.length > 25) {
    const rowsLeft = evl.results.table.body.length - 25;
    logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
  }

  printBorder();
  logger.info(chalk.cyan(`Eval ${id}`));
  printBorder();
  // TODO(ian): List prompt ids
  logger.info(`${prompts.length} prompts`);
  logger.info(
    `${vars.length} variables: ${vars.slice(0, 5).join(', ')}${
      vars.length > 5 ? ` (and ${vars.length - 5} more...)` : ''
    }`,
  );
}

async function handlePrompt(id: string) {
  telemetry.maybeShowNotice();
  telemetry.record('command_used', {
    name: 'show prompt',
  });
  await telemetry.send();

  const prompt = await getPromptFromHash(id);
  if (!prompt) {
    logger.error(`Prompt with ID ${id} not found.`);
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
      'Raw score': evl.metrics?.score.toFixed(2) || '-',
      'Pass rate':
        evl.metrics && evl.metrics.testPassCount + evl.metrics.testFailCount > 0
          ? `${(
              (evl.metrics.testPassCount /
                (evl.metrics.testPassCount + evl.metrics.testFailCount)) *
              100
            ).toFixed(2)}%`
          : '-',
      'Pass count': evl.metrics?.testPassCount || '-',
      'Fail count': evl.metrics?.testFailCount || '-',
    });
  }
  logger.info(wrapTable(table));
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show dataset <id>')} to see details of a specific dataset.`,
  );
}

async function handleDataset(id: string) {
  telemetry.maybeShowNotice();
  telemetry.record('command_used', {
    name: 'show dataset',
  });
  await telemetry.send();

  const dataset = await getDatasetFromHash(id);
  if (!dataset) {
    logger.error(`Dataset with ID ${id} not found.`);
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
      'Raw score': prompt.prompt.metrics?.score.toFixed(2) || '-',
      'Pass rate':
        prompt.prompt.metrics &&
        prompt.prompt.metrics.testPassCount + prompt.prompt.metrics.testFailCount > 0
          ? `${(
              (prompt.prompt.metrics.testPassCount /
                (prompt.prompt.metrics.testPassCount + prompt.prompt.metrics.testFailCount)) *
              100
            ).toFixed(2)}%`
          : '-',
      'Pass count': prompt.prompt.metrics?.testPassCount || '-',
      'Fail count': prompt.prompt.metrics?.testFailCount || '-',
    });
  }
  logger.info(wrapTable(table));
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
}
