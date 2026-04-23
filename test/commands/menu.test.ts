import { EventEmitter } from 'node:events';
import { spawn } from 'child_process';

import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { menuCommand, showMenuIfNoArgs } from '../../src/commands/menu';
import logger from '../../src/logger';
import { runInkMenu, shouldUseInkMenu } from '../../src/ui/menu';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../src/ui/menu', () => ({
  runInkMenu: vi.fn(),
  shouldUseInkMenu: vi.fn(() => false),
}));

function createProgram() {
  const program = new Command();
  program.exitOverride();
  menuCommand(program);
  return program;
}

function getMenuSubcommand(program: Command) {
  const command = program.commands.find((cmd) => cmd.name() === 'menu');
  if (!command) {
    throw new Error('menu command not registered');
  }
  return command;
}

function mockSpawnClose(code: number | null, signal?: NodeJS.Signals) {
  const child = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);
  setTimeout(() => child.emit('close', code, signal), 0);
  return child;
}

describe('menu command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldUseInkMenu).mockReturnValue(false);
    vi.mocked(runInkMenu).mockResolvedValue({ cancelled: true });
    process.exitCode = undefined;
  });

  it('prints fallback commands when the interactive menu is unavailable', async () => {
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(runInkMenu).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Interactive menu not available (non-TTY or CI environment).',
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('promptfoo eval'));
  });

  it('does not execute a child command when the interactive menu is cancelled', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockResolvedValue({ cancelled: true });
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(spawn).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('executes the selected menu item and propagates its exit code', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockResolvedValue({
      cancelled: false,
      selectedItem: {
        category: 'quick',
        description: 'Run prompts against test cases',
        id: 'eval',
        label: 'Run Evaluation',
      },
    });
    mockSpawnClose(7);
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(spawn).toHaveBeenCalledWith(process.argv[0], [process.argv[1], 'eval'], {
      env: process.env,
      stdio: 'inherit',
    });
    expect(process.exitCode).toBe(7);
  });

  it('returns one for unknown menu selections', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockResolvedValue({
      cancelled: false,
      selectedItem: {
        category: 'quick',
        description: 'Unsupported item',
        id: 'unknown',
        label: 'Unknown',
      },
    });
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(logger.error).toHaveBeenCalledWith('Unknown menu item: unknown');
    expect(process.exitCode).toBe(1);
  });

  it('maps child process signals to conventional exit codes', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockResolvedValue({
      cancelled: false,
      selectedItem: {
        category: 'quick',
        description: 'Open web UI',
        id: 'view',
        label: 'View Results',
      },
    });
    mockSpawnClose(null, 'SIGTERM');
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(process.exitCode).toBe(143);
  });

  it('reports menu render errors', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockRejectedValue(new Error('render failed'));
    const program = createProgram();

    await getMenuSubcommand(program).parseAsync(['node', 'test']);

    expect(logger.error).toHaveBeenCalledWith('Menu failed: render failed');
    expect(process.exitCode).toBe(1);
  });
});

describe('showMenuIfNoArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldUseInkMenu).mockReturnValue(true);
    vi.mocked(runInkMenu).mockResolvedValue({ cancelled: true });
    process.exitCode = undefined;
  });

  it('does not show the menu when command arguments are present', async () => {
    await expect(showMenuIfNoArgs(['node', 'promptfoo', 'eval'])).resolves.toBe(false);
    expect(runInkMenu).not.toHaveBeenCalled();
  });

  it('does not show the menu when flags are present', async () => {
    await expect(showMenuIfNoArgs(['node', 'promptfoo', '--help'])).resolves.toBe(false);
    expect(runInkMenu).not.toHaveBeenCalled();
  });

  it('returns false when the interactive menu is unavailable', async () => {
    vi.mocked(shouldUseInkMenu).mockReturnValue(false);

    await expect(showMenuIfNoArgs(['node', 'promptfoo'])).resolves.toBe(false);
    expect(runInkMenu).not.toHaveBeenCalled();
  });

  it('returns true when a no-args interactive menu is cancelled', async () => {
    await expect(showMenuIfNoArgs(['node', 'promptfoo'])).resolves.toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('returns false when the no-args interactive menu fails to render', async () => {
    vi.mocked(runInkMenu).mockRejectedValue(new Error('tty failed'));

    await expect(showMenuIfNoArgs(['node', 'promptfoo'])).resolves.toBe(false);
    expect(logger.debug).toHaveBeenCalledWith('Interactive menu failed: tty failed');
  });

  it('executes the selected no-args menu item', async () => {
    vi.mocked(runInkMenu).mockResolvedValue({
      cancelled: false,
      selectedItem: {
        category: 'quick',
        description: 'Share latest eval',
        id: 'share',
        label: 'Share',
      },
    });
    mockSpawnClose(0);

    await expect(showMenuIfNoArgs(['node', 'promptfoo'])).resolves.toBe(true);

    expect(spawn).toHaveBeenCalledWith(process.argv[0], [process.argv[1], 'share'], {
      env: process.env,
      stdio: 'inherit',
    });
    expect(process.exitCode).toBe(0);
  });
});
