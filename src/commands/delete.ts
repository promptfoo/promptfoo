import confirm from '@inquirer/confirm';
import type { Command } from 'commander';
import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { deleteAllEvals, deleteEval, getEvalFromId } from '../util/database';

export async function handleEvalDelete(evalId: string, envPath?: string) {
  try {
    await deleteEval(evalId);
    logger.info(`Evaluation with ID ${evalId} has been successfully deleted.`);
  } catch (error) {
    logger.error(`Could not delete evaluation with ID ${evalId}:\n${error}`);
    process.exit(1);
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
}
