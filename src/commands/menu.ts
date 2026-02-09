/**
 * Menu command - Interactive main menu for promptfoo CLI.
 */

import { spawn } from 'child_process';

import chalk from 'chalk';
import logger from '../logger';
import { type MenuItem, runInkMenu, shouldUseInkMenu } from '../ui/menu';
import type { Command } from 'commander';

/**
 * Execute a command based on menu selection.
 * Returns a promise that resolves with the child process exit code.
 */
function executeCommand(item: MenuItem): Promise<number> {
  const commandMap: Record<string, string[]> = {
    eval: ['eval'],
    init: ['init'],
    redteam: ['redteam', 'init'],
    view: ['view'],
    login: ['auth', 'login'],
    logout: ['auth', 'logout'],
    whoami: ['auth', 'whoami'],
    teams: ['auth', 'teams', 'list'],
    share: ['share'],
    list: ['list', 'evals'],
    generate: ['generate', 'dataset'],
    cache: ['cache', 'manage'],
    config: ['config', 'get', 'email'],
  };

  const args = commandMap[item.id];
  if (!args) {
    logger.error(`Unknown menu item: ${item.id}`);
    return 1;
  }

  logger.info(`\nRunning: ${chalk.cyan(`promptfoo ${args.join(' ')}`)}\n`);

  return new Promise<number>((resolve) => {
    const child = spawn(process.argv[0], [process.argv[1], ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });

    child.on('error', (error) => {
      logger.error(`Failed to run command: ${error.message}`);
      resolve(1);
    });
  });
}

export function menuCommand(program: Command) {
  program
    .command('menu')
    .description('Open interactive menu')
    .action(async () => {
      if (!shouldUseInkMenu()) {
        logger.info('Interactive menu not available (non-TTY or CI environment).');
        logger.info('');
        logger.info('Available commands:');
        logger.info('  promptfoo eval       - Run evaluations');
        logger.info('  promptfoo init       - Initialize a new project');
        logger.info('  promptfoo redteam    - Red team security testing');
        logger.info('  promptfoo view       - Open web UI');
        logger.info('  promptfoo auth login - Login to Promptfoo Cloud');
        logger.info('  promptfoo --help     - Show all commands');
        return;
      }

      const result = await runInkMenu();

      if (result.cancelled) {
        return;
      }

      if (result.selectedItem) {
        const exitCode = await executeCommand(result.selectedItem);
        process.exitCode = exitCode;
      }
    });
}

/**
 * Show the interactive menu if running without arguments.
 * Returns true if the menu was shown, false otherwise.
 */
export async function showMenuIfNoArgs(args: string[]): Promise<boolean> {
  // Check if running with no command (just 'promptfoo' or 'promptfoo --version' etc.)
  const nonFlagArgs = args.filter((arg) => !arg.startsWith('-'));

  // If there are command arguments, don't show menu
  if (nonFlagArgs.length > 2) {
    return false;
  }

  // Check if any flags that should bypass menu
  const bypassFlags = ['--help', '-h', '--version', '-V'];
  if (args.some((arg) => bypassFlags.includes(arg))) {
    return false;
  }

  // Check if interactive menu is enabled
  if (!shouldUseInkMenu()) {
    return false;
  }

  const result = await runInkMenu();

  if (result.cancelled) {
    return true;
  }

  if (result.selectedItem) {
    const exitCode = await executeCommand(result.selectedItem);
    process.exitCode = exitCode;
  }

  return true;
}
