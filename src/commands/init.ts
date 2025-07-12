import type { Command } from 'commander';

// Re-export for tests and backward compatibility
export { downloadFile, downloadDirectory, EXAMPLES } from './init/initAction';

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files or download an example')
    .option('--no-interactive', 'Do not run in interactive mode')
    .option('--example [name]', 'Download an example from the promptfoo repo')
    .action(async (directory: string | null, cmdObj: any) => {
      // Lazy load the action handler
      const { initAction } = await import('./init/initAction');
      await initAction(directory, cmdObj);
    });
}