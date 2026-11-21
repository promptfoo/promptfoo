import cliState from '../cliState';
import logger from '../logger';
import { inspectDefaultProviders } from '../providers/defaults';
import telemetry from '../telemetry';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types/index';

export function providersCommand(program: Command, defaultConfig: Partial<UnifiedConfig>) {
  program
    .command('providers')
    .description('Show automatic default provider assignments')
    .action(async () => {
      telemetry.record('command_used', { name: 'providers' });
      try {
        const providers = await cliState.withEnv(defaultConfig.env, () =>
          inspectDefaultProviders(defaultConfig.env),
        );
        logger.info('Automatic default providers:');
        for (const [slot, provider] of Object.entries(providers)) {
          if (provider) {
            logger.info(`  ${slot}: ${provider.id()}`);
          }
        }
        logger.info(
          'Eval-specific provider overrides are not included. No model requests were made.',
        );
      } catch (error) {
        logger.error('Failed to determine default providers', { error });
        process.exitCode = 1;
      }
    });
}
