import type { Command } from 'commander';

export { downloadFile, downloadDirectory } from './init/initAction';

export function initCommand(program: Command) {
  program
    .command('init [directory]')
    .description('Initialize project with dummy files or download an example')
    .option('--no-interactive', 'Run in interactive mode')
    .option('--web', 'Initialize a web viewer project from the Promptfoo github repository')
    .action(
      async (directory: string | undefined, cmdObj: { interactive: boolean; web: boolean }) => {
        const { initAction } = await import('./init/initAction');
        await initAction(directory || null, cmdObj);
      },
    );
}
