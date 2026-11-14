import readline from 'readline';

export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/** Rejects if stdin closes before a line is submitted. */
export async function promptUser(question: string): Promise<string> {
  const closedMessage = 'Input closed before an answer was received';
  if (!process.stdin.readable) {
    throw new Error(closedMessage);
  }

  const rl = createReadlineInterface();
  try {
    return await new Promise<string>((resolve, reject) => {
      rl.once('error', reject);
      rl.once('close', () => reject(new Error(closedMessage)));
      rl.question(question, resolve);
    });
  } finally {
    rl.close();
  }
}

/**
 * Prompts the user with a yes/no question and returns a boolean.
 * @param question The question to ask
 * @param defaultYes If true, empty response defaults to yes. If false, defaults to no.
 */
export async function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? '(Y/n): ' : '(y/N): ';
  const answer = await promptUser(`${question} ${suffix}`);

  if (defaultYes) {
    return !answer.trim().toLowerCase().startsWith('n');
  }
  return answer.trim().toLowerCase().startsWith('y');
}
