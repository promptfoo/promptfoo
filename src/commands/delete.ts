import confirm from '@inquirer/confirm';
import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import {
  deleteAllEvals,
  deleteEval,
  deleteEvalResult,
  deleteEvalResultsByTestIndex,
  getEvalFromId,
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

export async function handleEvalResultDelete(resultId: string, evalId?: string) {
  try {
    const deleted = await deleteEvalResult(resultId, evalId);
    logger.info(
      `Deleted eval result ${resultId} from evaluation ${deleted.evalId} (testIdx=${deleted.testIdx}, promptIdx=${deleted.promptIdx}).`,
    );
  } catch (error) {
    logger.error(`Could not delete eval result ${resultId}:\n${error}`);
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
    .option('--result-id <resultId>', 'Delete a specific result row from the evaluation')
    .option(
      '--result-idx <testIdx>',
      'Delete all prompt outputs for a test row by testIdx',
      parseInt,
    )
    .action(async (evalId, cmdObj) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'delete eval',
        evalId,
        hasResultId: Boolean(cmdObj.resultId),
        hasResultIdx: cmdObj.resultIdx !== undefined,
      });

      if (cmdObj.resultId && cmdObj.resultIdx !== undefined) {
        logger.error('Use either --result-id or --result-idx, not both.');
        process.exitCode = 1;
        return;
      }

      if (cmdObj.resultId) {
        await handleEvalResultDelete(cmdObj.resultId, evalId);
        return;
      }

      if (cmdObj.resultIdx !== undefined) {
        try {
          const deletedCount = await deleteEvalResultsByTestIndex(evalId, cmdObj.resultIdx);
          logger.info(
            `Deleted ${deletedCount} eval result${deletedCount === 1 ? '' : 's'} from evaluation ${evalId} for testIdx=${cmdObj.resultIdx}.`,
          );
        } catch (error) {
          logger.error(
            `Could not delete eval results for ${evalId} testIdx=${cmdObj.resultIdx}:\n${error}`,
          );
          process.exitCode = 1;
        }
        return;
      }

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
    .command('eval-result <resultId>')
    .description('Delete a single eval result row by result ID')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--eval-id <evalId>', 'Optional owning evaluation ID for validation')
    .action(async (resultId: string, cmdObj: { envPath?: string; evalId?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'delete eval-result',
        resultId,
        ...(cmdObj.evalId ? { evalId: cmdObj.evalId } : {}),
      });

      await handleEvalResultDelete(resultId, cmdObj.evalId);
    });
}
