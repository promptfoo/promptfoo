import type { Command } from 'commander';

// Re-export functions for backward compatibility
export { notCloudEnabledShareInstructions, createAndDisplayShareableUrl } from './share/shareAction';

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)' + '\n\n')
    .option(
      '--show-auth',
      'Show username/password authentication information in the URL if exists',
      false,
    )
    // NOTE: Added in 0.109.1 after migrating sharing to promptfoo.app in 0.108.0
    .option(
      '-y, --yes',
      'Flag does nothing (maintained for backwards compatibility only - shares are now private by default)',
      false,
    )
    .action(
      async (
        evalId: string | undefined,
        cmdObj: { yes: boolean; envPath?: string; showAuth: boolean } & Command,
      ) => {
        const { shareAction } = await import('./share/shareAction');
        await shareAction(evalId, cmdObj);
      },
    );
}