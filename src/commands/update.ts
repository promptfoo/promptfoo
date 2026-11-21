import { Command } from 'commander';
import { getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { getInstallationInfo, getUpdateMessage } from '../updates/installationInfo';
import { runNpmUpdate } from '../updates/updateCommandUtils';

export function updateCommand(
  program: Command,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
) {
  return program
    .command('update')
    .description('Update a global npm installation of Promptfoo')
    .option('--check', 'Check for updates without installing')
    .option('--force', 'Update even if update checks are disabled')
    .action(async (options) => {
      try {
        const disabled =
          parseEnvBool(sourceEnvironment.PROMPTFOO_DISABLE_UPDATE) ||
          getEnvBool('PROMPTFOO_DISABLE_UPDATE');
        if (disabled && (options.check || !options.force)) {
          logger.info('Update check skipped because PROMPTFOO_DISABLE_UPDATE is enabled.');
          return;
        }
        if (options.check) {
          logger.info('Checking for updates...');
          logger.info(await getUpdateMessage(sourceEnvironment));
          return;
        }
        const projectRoot = process.cwd();
        const installation = getInstallationInfo(projectRoot, sourceEnvironment);
        if (!installation.canUpdate) {
          logger.info(installation.message);
          return;
        }
        logger.info('Installing the latest Promptfoo release from your npm registry...');
        await runNpmUpdate(installation.context);
        logger.info('Promptfoo updated. The next command will use the new version.');
      } catch (error) {
        logger.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode ||= 1;
      }
    });
}
