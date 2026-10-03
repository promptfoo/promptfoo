import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { viewCommand } from '../../src/commands/view';
import logger from '../../src/logger';
import { startServer } from '../../src/server/server';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../src/util/config/manage', () => ({
  setConfigDirectoryPath: vi.fn(),
}));
vi.mock('../../src/server/server');
vi.mock('../../src/util');

describe('viewCommand ambiguous eval IDs', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('reports an empty eval ID cleanly', async () => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await expect(viewCmd.parseAsync(['node', 'test', '--id', ''])).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledWith('Eval ID cannot be empty when using --id.');
    expect(process.exitCode).toBe(1);
    expect(startServer).not.toHaveBeenCalled();
  });

  it.each(['.', '..'])('reports the invalid dot-segment eval ID %s cleanly', async (evalId) => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await expect(viewCmd.parseAsync(['node', 'test', '--id', evalId])).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Eval IDs "." and ".." cannot be opened with --id because browsers normalize dot-segment URL paths.',
    );
    expect(process.exitCode).toBe(1);
    expect(startServer).not.toHaveBeenCalled();
  });

  it.each([
    'archive%2F2026',
    'archive%2f2026',
    'archive%3F2026',
    'archive%232026',
    'archive%252026',
  ])('reports the ambiguous percent-encoded eval ID %s cleanly', async (evalId) => {
    viewCommand(program);
    const viewCmd = program.commands[0];

    await expect(viewCmd.parseAsync(['node', 'test', '--id', evalId])).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Eval IDs containing literal percent-encoded sequences cannot be opened with --id because routers may decode them into different IDs.',
    );
    expect(process.exitCode).toBe(1);
    expect(startServer).not.toHaveBeenCalled();
  });
});
