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
 */
function executeCommand(item: MenuItem): void {
  const commandMap: Record<string, string[]> = {
    eval: ['eval'],
    init: ['init'],
    redteam: ['redteam', 'init'],
    view: ['view'],
    login: ['auth', 'login'],
    logout: ['auth', 'logout'],
    whoami: ['auth', 'whoami'],
    teams: ['auth', 'teams', 'list'],
    share: ['share', '--interactive'],
    list: ['list', 'evals', '--interactive'],
    generate: ['generate', 'dataset'],
    cache: ['cache', 'manage'],
    config: ['config', 'get', 'email'],
  };

  const args = commandMap[item.id];
  if (!args) {
    logger.error(`Unknown menu item: ${item.id}`);
    return;
  }

  logger.info(`\nRunning: ${chalk.cyan(`promptfoo ${args.join(' ')}`)}\n`);

  // Spawn the command as a child process
  const child = spawn(process.argv[0], [process.argv[1], ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    logger.error(`Failed to run command: ${error.message}`);
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
        executeCommand(result.selectedItem);
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
    executeCommand(result.selectedItem);
  }

  return true;
}
