import type { Command } from 'commander';

export { notCloudEnabledShareInstructions, createAndDisplayShareableUrl } from './share/shareAction';

export function shareCommand(program: Command) {
  program
    .command('share [evalId]')
    .description('Create a shareable URL of an eval (defaults to most recent)')
    .option('-y, --yes', 'Skip confirmation')
    .option(
      '--env-path <path>',
      'Path to the environment directory or file (usually .env, .env.local, or .env.production)',
    )
    .action(async function(this: any, evalId: string | undefined, cmdObj: { yes: boolean; envPath?: string }) {
      const { shareAction } = await import('./share/shareAction');
      await shareAction(evalId, { ...cmdObj, showAuth: true, ...this });
    });
}
