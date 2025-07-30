import type { Command } from 'commander';
import type { UnifiedConfig } from '../types';

export function debugCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('debug')
    .description('Display debug information for troubleshooting')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .action(async (opts) => {
      const { doDebug } = await import('./debug/debugAction');
      await doDebug({ ...opts, defaultConfig, defaultConfigPath });
    });
}
