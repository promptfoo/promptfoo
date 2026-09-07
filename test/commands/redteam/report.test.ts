import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { redteamReportCommand } from '../../../src/commands/redteam/report';

describe('redteamReportCommand', () => {
  it('registers report through its public module entry point', () => {
    const program = new Command();

    expect(redteamReportCommand(program)).toBeUndefined();
    expect(program.commands.map((command) => command.name())).toEqual(['report']);
  });
});
