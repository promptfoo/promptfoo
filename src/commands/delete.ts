import { Command } from 'commander';
import { deleteEval, getEvalFromId, setupEnv } from '../util';
import logger from '../logger';
import telemetry from '../telemetry';

export function deleteCommand(program: Command) {
  const deleteCommand = program
    .command('delete <id>')
    .description('Delete various resources')
    .option('--env-path <path>', 'Path to the environment file')
    .action(async (id: string, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'delete',
      });

      const evl = await getEvalFromId(id);
      if (evl) {
        return handleEvalDelete(id, cmdObj.envPath);
      }

      logger.error(`No resource found with ID ${id}`);
    });

  deleteCommand
    .command('eval <id>')
    .description('Delete an evaluation by ID.')
    .option('--env-path <path>', 'Path to the environment file')
    .action(async (evalId, cmdObj) => {
      setupEnv(cmdObj.envPath);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'delete eval',
        evalId: evalId,
      });
      await telemetry.send();

      handleEvalDelete(evalId, cmdObj.envPath);
    });
}

async function handleEvalDelete(evalId: string, envPath?: string) {
  try {
    await deleteEval(evalId);
    logger.info(`Evaluation with ID ${evalId} has been successfully deleted.`);
  } catch (error) {
    logger.error(`Could not delete evaluation with ID ${evalId}:\n${error}`);
    process.exit(1);
  }
}
