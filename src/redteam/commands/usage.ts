import { getProbeLimitsEnforcementEnabled } from '../../constants';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { checkMonthlyProbeLimit, formatProbeUsageMessage } from '../../util/redteamProbeLimit';
import type { Command } from 'commander';

export function redteamUsageCommand(program: Command) {
  program
    .command('usage')
    .description('Show current redteam probe usage and limits')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(
      async (
        cmdObj: {
          envPath?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envPath);

        // Check if probe limits are enabled after env is loaded
        if (!getProbeLimitsEnforcementEnabled()) {
          logger.error(
            'Probe limits are not enabled. This command is only available when limits are active.',
          );
          process.exit(1);
        }

        telemetry.record('command_used', {
          name: 'redteam usage',
        });

        try {
          const probeStatus = await checkMonthlyProbeLimit();
          const usageMessage = formatProbeUsageMessage(probeStatus);

          if (usageMessage) {
            logger.info(usageMessage);
          } else {
            logger.info(
              'You are an enterprise customer, talk to your administrator for more information on your usage.',
            );
          }
        } catch (error) {
          logger.error(`Error checking probe usage: ${error}`);
          process.exit(1);
        }
      },
    );
}
