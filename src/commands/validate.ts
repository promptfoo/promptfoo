import type { Command } from 'commander';
import type { UnifiedConfig } from '../types';

interface ValidateOptions {
  config?: string[];
  envPath?: string;
}

// Re-export for backward compatibility
export { doValidate } from './validate/validateAction';

export function validateCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('validate')
    .description('Validate a promptfoo configuration file')
    .option(
      '-c, --config <paths...>',
      'Path to configuration file. Automatically loads promptfooconfig.yaml',
    )
    .action(async (opts: ValidateOptions) => {
      const { validateAction } = await import('./validate/validateAction');
      await validateAction(opts, defaultConfig, defaultConfigPath);
    });
}
