import type { Command } from 'commander';
import { BrowserBehavior, startServer } from '../server/server';
import telemetry from '../telemetry';

export function serveCommand(program: Command) {
  program
    .command('serve')
    .description('Start the server')
    .action(
      async (
        cmdObj: {
          port: number;
        } & Command,
      ) => {
        telemetry.maybeShowNotice();
        telemetry.record('command_used', {
          name: 'serve',
        });
        await telemetry.send();

        await startServer(
          Number.parseInt(process.env.PORT || '15500'),
          process.env.BASE_URL,
          BrowserBehavior.SKIP,
        );
      },
    );
}
