import type { Command } from 'commander';

export function cacheCommand(program: Command) {
  program
    .command('cache')
    .description('Manage cache')
    .command('clear')
    .description('Clear cache')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { envPath?: string }) => {
      const { cacheClearAction } = await import('./cache/cacheAction');
      await cacheClearAction(cmdObj);
    });
}