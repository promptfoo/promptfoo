import readline from 'readline';

/**
 * Factory function for creating readline interface.
 * This abstraction makes it easier to mock in tests and prevents open handles.
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts the user with a question and returns their answer.
 * Automatically handles cleanup of the readline interface.
 */
export async function promptUser(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let rl: readline.Interface | null = null;

    try {
      rl = createReadlineInterface();

      // Handle errors
      rl.on('error', (err) => {
        if (rl) {
          rl.close();
        }
        reject(err);
      });

      rl.question(question, (answer) => {
        if (rl) {
          rl.close();
        }
        resolve(answer);
      });
    } catch (err) {
      if (rl) {
        rl.close();
      }
      reject(err);
    }
  });
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
