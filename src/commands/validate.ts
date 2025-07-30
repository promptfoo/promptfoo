import type { Command } from 'commander';

export { doValidate } from './validate/validateAction';

export function validateCommand(program: Command, defaultConfig: any, defaultConfigPath?: string) {
  program
    .command('validate [filePath]')
    .description('Validate the configuration')
    .option(
      '-c, --config <path>',
      'Path to config file(s) (option for compatibility, prefer positional arg)',
    )
    .action(async (filePath: string | undefined, cmdObj: { config?: string }) => {
      const { validateAction } = await import('./validate/validateAction');
      await validateAction(filePath, cmdObj, defaultConfig, defaultConfigPath);
    });
}
