import type { Command } from 'commander';

export { doValidate } from './validate/validateAction';

export function validateCommand(program: Command) {
  program
    .command('validate <filePath>')
    .description('Validate the configuration')
    .action(async (filePath: string) => {
      const { doValidate } = await import('./validate/validateAction');
      await doValidate({ config: [filePath] }, {}, undefined);
    });
}
