import { isRunningUnderNpx } from './index';

/**
 * Returns the appropriate command prefix based on how promptfoo is being run.
 * @param latest - If true, returns 'npx promptfoo@latest' for npx users
 * @returns 'npx promptfoo' or 'promptfoo' based on execution context
 */
export function getCommandPrefix(latest = false): string {
  if (isRunningUnderNpx()) {
    return latest ? 'npx promptfoo@latest' : 'npx promptfoo';
  }
  return 'promptfoo';
}

/**
 * Returns the full command string with the appropriate prefix.
 * @param command - The command to run (e.g., 'eval', 'redteam init')
 * @param latest - If true, uses 'npx promptfoo@latest' for npx users
 * @returns The full command string
 */
export function getCommand(command: string, latest = false): string {
  return `${getCommandPrefix(latest)} ${command}`;
}