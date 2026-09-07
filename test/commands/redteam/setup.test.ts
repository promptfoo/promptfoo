import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { redteamSetupCommand } from '../../../src/commands/redteam/setup';

describe('redteamSetupCommand', () => {
  it('registers setup through its public module entry point', () => {
    const program = new Command();

    expect(redteamSetupCommand(program)).toBeUndefined();
    expect(program.commands.map((command) => command.name())).toEqual(['setup']);
  });
});
