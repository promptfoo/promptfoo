import confirm from '@inquirer/confirm';
import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import {
  deleteAllEvals,
  deleteEval,
  deleteEvalResult,
  EvalResultNotFoundError,
  getEvalFromId,
  getEvalIdForResult,
} from '../util/database';
import { setupEnv } from '../util/index';
import type { Command } from 'commander';

export async function handleEvalDelete(evalId: string, _envPath?: string) {
  try {
    await deleteEval(evalId);
    logger.info(`Evaluation with ID ${evalId} has been successfully deleted.`);
  } catch (error) {
    logger.error(`Could not delete evaluation with ID ${evalId}:\n${error}`);
    process.exitCode = 1;
  }
}

export async function handleEvalDeleteAll() {
  const confirmed = await confirm({
    message:
      'Are you sure you want to delete all stored evaluations? This action cannot be undone.',
  });
  if (!confirmed) {
    return;
  }
  await deleteAllEvals();
  logger.info('All evaluations have been deleted.');
}

export async function handleEvalResultDelete(resultId: string, _envPath?: string) {
  try {
    // Look up the parent evalId from the result row so the storage delete is
    // scoped to (evalId, resultId): a stray uuid that exists under a different
    // eval must not be deleted by the bare `eval-result <id>` invocation.
    const evalId = await getEvalIdForResult(resultId);
    if (!evalId) {
      logger.error(`No eval result found with ID ${resultId}.`);
      process.exitCode = 1;
      return;
    }
    await deleteEvalResult(evalId, resultId);
    logger.info(`Eval result with ID ${resultId} has been successfully deleted.`);
  } catch (error) {
    if (error instanceof EvalResultNotFoundError) {
      logger.error(`No eval result found with ID ${resultId}.`);
      process.exitCode = 1;
      return;
    }
    logger.error(
      `Could not delete eval result with ID ${resultId}:\n${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}

export function deleteCommand(program: Command) {
  const deleteCommand = program
    .command('delete <id>')
    .description('Delete various resources')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'delete',
      });

      const evl = await getEvalFromId(id);
      if (evl) {
        return handleEvalDelete(id, cmdObj.envPath);
      }

      logger.error(`No resource found with ID ${id}`);
      process.exitCode = 1;
    });

  deleteCommand
    .command('eval <id>')
    .description(
      'Delete an evaluation by ID. Use "latest" to delete the most recent evaluation, or "all" to delete all evaluations.',
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (evalId, cmdObj) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'delete eval',
        evalId,
      });

      if (evalId === 'latest') {
        const latestResults = await Eval.latest();
        if (latestResults) {
          await handleEvalDelete(latestResults.id, cmdObj.envPath);
        } else {
          logger.error('No eval found.');
          process.exitCode = 1;
        }
      } else if (evalId === 'all') {
        await handleEvalDeleteAll();
      } else {
        await handleEvalDelete(evalId, cmdObj.envPath);
      }
    });

  deleteCommand
    .command('eval-result <id>')
    .description(
      'Delete a single result row within an eval session, leaving the rest of the eval intact.',
    )
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (resultId: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'delete eval-result',
      });
      await handleEvalResultDelete(resultId, cmdObj.envPath);
    });
}
