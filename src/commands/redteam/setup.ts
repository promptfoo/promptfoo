import { BrowserBehavior } from '../../util/server';
import { registerRedteamBrowserCommand } from './browserCommand';
import type { Command } from 'commander';

export function redteamSetupCommand(program: Command) {
  registerRedteamBrowserCommand(program, {
    command: 'setup [configDirectory]',
    description: 'Start browser UI and open to redteam setup',
    telemetryEvent: 'redteam setup',
    browserBehavior: BrowserBehavior.OPEN_TO_REDTEAM_CREATE,
  });
}
