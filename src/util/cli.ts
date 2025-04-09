/**
 * CLI-related utility functions
 */
import readline from 'readline';

/**
 * Check if the current process is running in an interactive terminal
 */
export function isInteractiveSession(): boolean {
  return process.stdout.isTTY && process.stdin.isTTY;
}

/**
 * Prompt for a yes/no answer
 * @param question The question to ask
 * @returns true if the answer starts with 'y', false otherwise
 */
export async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await new Promise((resolve) => {
      rl.question(`${question} (y/N): `, (answer: string) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  } finally {
    rl.close();
  }
}

/**
 * Prompt for text input
 * @param question The question to ask
 * @returns The user's input, trimmed
 */
export async function promptForInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer: string) => {
        resolve(answer.trim());
      });
    });
  } finally {
    rl.close();
  }
}
