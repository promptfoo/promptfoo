import { Command } from 'commander';
import { deleteEval, setupEnv } from '../util';
import logger from '../logger';
import telemetry from '../telemetry';

export function deleteCommand(program: Command) {
  program
    .command('delete eval <id>')
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

      try {
        await deleteEval(evalId);
        logger.info(`Evaluation with ID ${evalId} has been successfully deleted.`);
      } catch (error) {
        logger.error(`Error deleting evaluation with ID ${evalId}: ${error}`);
        process.exit(1);
      }
    });
}
