import { spawn } from 'node:child_process';

import { Command } from 'commander';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getInstallationInfo } from '../updates/installationInfo';
import { checkForUpdates, UPDATE_INSTRUCTIONS } from '../updates/updateCheck';
import {
  getUpdateSpawnContext,
  parseUpdateCommandForSpawn,
  withTargetVersion,
} from '../updates/updateCommandUtils';

export function updateCommand(
  program: Command,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
) {
  const updateCmd = program
    .command('update')
    .description('Update promptfoo to the latest version')
    .option('--check', 'Only check for updates without installing')
    .option('--force', 'Force update even if already on latest version')
    .action(async (options) => {
      try {
        logger.info('Checking for updates...');

        if (!options.force && getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
          logger.info('Update check skipped because PROMPTFOO_DISABLE_UPDATE is enabled.');
          return;
        }

        let updateInfo: Awaited<ReturnType<typeof checkForUpdates>>;
        try {
          updateInfo = await checkForUpdates({ throwOnError: true });
        } catch (error) {
          if (!options.force || options.check) {
            throw error;
          }

          logger.warn(
            'Unable to check the current published version; continuing with a forced update to the latest package tag.',
          );
          updateInfo = null;
        }

        if (options.check) {
          if (updateInfo) {
            logger.info(updateInfo.message);
            logger.info(UPDATE_INSTRUCTIONS);
          } else {
            logger.info('✓ You are running the latest version');
          }
          return;
        }

        if (!updateInfo && !options.force) {
          logger.info('✓ You are already running the latest version of promptfoo');
          return;
        }

        // Pass true for manual update command to get proper error messages (not auto-update wording)
        const installationInfo = getInstallationInfo(process.cwd(), true, sourceEnvironment);

        // Show what we detected
        logger.info(
          `Detected installation: ${installationInfo.packageManager} (${installationInfo.isGlobal ? 'global' : 'local'})`,
        );

        if (!installationInfo.updateCommand) {
          logger.warn('Cannot automatically update this installation.');
          if (installationInfo.updateMessage) {
            logger.info(installationInfo.updateMessage);
          }
          return;
        }

        const targetVersion = updateInfo ? updateInfo.update.latest : 'latest';
        const updateCommand = withTargetVersion(installationInfo.updateCommand, targetVersion);

        logger.info(`Running: ${updateCommand}`);

        const { command, args } = parseUpdateCommandForSpawn(updateCommand, sourceEnvironment);
        const spawnContext = getUpdateSpawnContext(sourceEnvironment);

        // Execute the update command and wait for it to complete
        await new Promise<void>((resolve, reject) => {
          const updateProcess = spawn(command, args, {
            ...spawnContext,
            stdio: 'inherit',
            shell: false, // Safer: no shell injection
          });

          updateProcess.on('close', (code) => {
            if (code === 0) {
              logger.info('✓ Update completed successfully!');
              logger.info('The new version will be used on your next run.');
              resolve();
            } else {
              logger.error(`Update failed with exit code ${code}`);
              if (installationInfo.updateMessage) {
                logger.info('Manual update instructions:');
                logger.info(installationInfo.updateMessage);
              }
              reject(new Error(`Update failed with exit code ${code}`));
            }
          });

          updateProcess.on('error', (err) => {
            logger.error(`Update failed: ${err.message}`);
            if (installationInfo.updateMessage) {
              logger.info('Manual update instructions:');
              logger.info(installationInfo.updateMessage);
            }
            reject(err);
          });
        });
      } catch (error) {
        logger.error(`Failed to update: ${error}`);
        process.exitCode = 1;
        return;
      }
    });

  return updateCmd;
}
