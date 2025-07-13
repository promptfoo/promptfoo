import type { Command } from 'commander';
import logger from '../../logger';
import { startServer } from '../../server/server';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { setConfigDirectoryPath } from '../../util/config/manage';
import { BrowserBehavior } from '../../util/server';

interface ViewCommandOptions {
  port: number;
  yes: boolean;
  no: boolean;
  apiBaseUrl?: string;
  envPath?: string;
  filterDescription?: string;
}

export async function viewAction(
  directory: string | undefined,
  cmdObj: ViewCommandOptions & Command,
): Promise<void> {
  setupEnv(cmdObj.envPath);
  telemetry.record('command_used', {
    name: 'view',
  });

  if (cmdObj.filterDescription) {
    logger.warn(
      'The --filter-description option is deprecated and no longer supported. The argument will be ignored.',
    );
  }

  if (directory) {
    setConfigDirectoryPath(directory);
  }

  // Block indefinitely on server
  const browserBehavior = cmdObj.yes
    ? BrowserBehavior.OPEN
    : cmdObj.no
      ? BrowserBehavior.SKIP
      : BrowserBehavior.ASK;
  await startServer(cmdObj.port, browserBehavior);
}
