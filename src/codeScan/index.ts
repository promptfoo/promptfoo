import { runCommand } from './commands/run';
import type { Command } from 'commander';

/**
 * Register the code-scans command group
 * Pattern matches redteam command structure
 */
export function codeScansCommand(program: Command): void {
  const codeScansCommand = program
    .command('code-scans')
    .description('Scan code for LLM security vulnerabilities');

  // Register subcommands
  runCommand(codeScansCommand);
}
