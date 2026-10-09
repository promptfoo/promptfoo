import cliState from '../cliState';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types/index';

export function providersCommand(program: Command, defaultConfig: Partial<UnifiedConfig>) {
  program
    .command('providers')
    .description('Show automatic default provider assignments')
    .action(async () => {
      try {
        const providers = await cliState.withEnv(defaultConfig.env, () =>
          getDefaultProviders(defaultConfig.env),
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
