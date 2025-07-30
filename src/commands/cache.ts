import type { Command } from 'commander';

export function cacheCommand(program: Command) {
  const cacheCommand = program.command('cache').description('Manage cache');

  cacheCommand
    .command('clear')
    .description('Clear all cache')
    .action(async () => {
      const { cacheClearAction } = await import('./cache/cacheAction');
      await cacheClearAction({});
    });
}
