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
    .option('--force', 'Reinstall even if current or update checks are disabled')
    .action(async (options) => {
      try {
        const disabled =
          parseEnvBool(sourceEnvironment.PROMPTFOO_DISABLE_UPDATE) ||
          getEnvBool('PROMPTFOO_DISABLE_UPDATE');
        if (disabled && (options.check || !options.force)) {
          logger.info('Update check skipped because PROMPTFOO_DISABLE_UPDATE is enabled.');
          return;
        }
        logger.info('Checking for updates...');
        let info;
        try {
          info = await checkForUpdates({
            throwOnError: true,
            ignoreDisableUpdate: !!options.force,
          });
        } catch (error) {
          if (!options.force || options.check) {
            throw error;
          }
          logger.warn(
            'Version lookup failed. Installing the latest package tag as requested by --force.',
          );
        }
        if (options.check) {
          logger.info(info?.message ?? 'You are running the latest version of Promptfoo.');
          if (info) {
            logger.info(getUpdateInstructions());
          }
          return;
        }
        if (!info && !options.force) {
          logger.info('You are running the latest version of Promptfoo.');
          return;
        }
        const projectRoot = process.cwd();
        const installation = getInstallationInfo(projectRoot, sourceEnvironment);
        if (!installation.canUpdate) {
          logger.info(installation.message);
          return;
        }
        const version = info?.update.latest ?? 'latest';
        logger.info(`Updating Promptfoo to ${version}...`);
        await runNpmUpdate(version, sourceEnvironment, projectRoot);
        logger.info('Promptfoo updated. The next command will use the new version.');
      } catch (error) {
        logger.error(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
