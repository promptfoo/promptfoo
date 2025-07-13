import type { Command } from 'commander';

export function authCommand(program: Command) {
  const authCommand = program.command('auth').description('Manage authentication');

  authCommand
    .command('login')
    .description('Login')
    .option('-o, --org <orgId>', 'The organization id to login to.')
    .option(
      '-h,--host <host>',
      'The host of the promptfoo instance. This needs to be the url of the API if different from the app url.',
    )
    .option('-k, --api-key <apiKey>', 'Login using an API key.')
    .action(async (cmdObj: { orgId: string; host: string; apiKey: string }) => {
      const { loginAction } = await import('./auth/authAction');
      await loginAction(cmdObj);
    });

  authCommand
    .command('logout')
    .description('Logout')
    .action(async () => {
      const { logoutAction } = await import('./auth/authAction');
      await logoutAction();
    });

  authCommand
    .command('whoami')
    .description('Show current user information')
    .action(async () => {
      const { whoamiAction } = await import('./auth/authAction');
      await whoamiAction();
    });
}
