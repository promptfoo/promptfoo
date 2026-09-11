import { BrowserBehavior } from '../../util/server';
import { registerRedteamBrowserCommand } from './browserCommand';
import type { Command } from 'commander';

export function redteamReportCommand(program: Command) {
  registerRedteamBrowserCommand(program, {
    command: 'report [directory]',
    description: 'Start browser UI and open to report',
    telemetryEvent: 'redteam report',
    browserBehavior: BrowserBehavior.OPEN_TO_REPORT,
  });
}
