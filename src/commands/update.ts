import { Command } from 'commander';
import { getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { getInstallationInfo } from '../updates/installationInfo';
import { checkForUpdates, getUpdateInstructions } from '../updates/updateCheck';
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
          const info = await checkForUpdates({ throwOnError: true });
          logger.info(info?.message ?? 'You are running the latest version of Promptfoo.');
          if (info) {
            logger.info(getUpdateInstructions());
          }
          return;
        }
        const projectRoot = process.cwd();
        const installation = getInstallationInfo(projectRoot, sourceEnvironment);
        if (!installation.canUpdate) {
          logger.info(installation.message);
          return;
        }
        logger.info('Installing the latest Promptfoo release from your npm registry...');
        await runNpmUpdate(sourceEnvironment, projectRoot);
        logger.info('Promptfoo updated. The next command will use the new version.');
      } catch (error) {
        logger.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode ||= 1;
      }
    });
}
