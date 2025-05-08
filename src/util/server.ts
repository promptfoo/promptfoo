import opener from 'opener';
import readline from 'readline';
import { VERSION, getDefaultPort } from '../constants';
import { getEnvString } from '../envars';
import logger from '../logger';

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
  OPEN_TO_REPORT = 3,
  OPEN_TO_REDTEAM_CREATE = 4,
}

/**
 * Prompts the user with a question and returns a Promise that resolves with their answer
 */
export async function promptUser(question: string): Promise<string> {
  // Special handling for test environment
  if (getEnvString('NODE_ENV') === 'test' || getEnvString('JEST_WORKER_ID')) {
    // In tests, don't create a real readline interface
    return 'y'; // Default test response
  }
  
  let rl: readline.Interface | null = null;
  
  try {
    return await new Promise((resolve, reject) => {
      try {
        // Create readline interface
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        // Add error handler
        rl.on('error', (err) => {
          if (rl) {
            rl.close();
            rl = null;
          }
          reject(err);
        });
        
        // Ask the question
        rl.question(question, (answer) => {
          if (rl) {
            rl.close();
            rl = null;
          }
          resolve(answer);
        });
      } catch (err) {
        if (rl) {
          rl.close();
          rl = null;
        }
        reject(err);
      }
    });
  } finally {
    // Ensure readline is closed in all cases
    if (rl) {
      rl.close();
      rl = null;
    }
  }
}

/**
 * Prompts the user with a yes/no question and returns a Promise that resolves with a boolean
 */
export async function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? '(Y/n): ' : '(y/N): ';
  const answer = await promptUser(`${question} ${suffix}`);

  if (defaultYes) {
    return !answer.toLowerCase().startsWith('n');
  }
  return answer.toLowerCase().startsWith('y');
}

export async function checkServerRunning(port = getDefaultPort()): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`);
    const data = await response.json();
    return data.status === 'OK' && data.version === VERSION;
  } catch (err) {
    logger.debug(`Failed to check server health: ${String(err)}`);
    return false;
  }
}

export async function openBrowser(
  browserBehavior: BrowserBehavior,
  port = getDefaultPort(),
): Promise<void> {
  const baseUrl = `http://localhost:${port}`;
  let url = baseUrl;
  if (browserBehavior === BrowserBehavior.OPEN_TO_REPORT) {
    url = `${baseUrl}/report`;
  } else if (browserBehavior === BrowserBehavior.OPEN_TO_REDTEAM_CREATE) {
    url = `${baseUrl}/redteam/setup`;
  }

  const doOpen = async () => {
    try {
      logger.info('Press Ctrl+C to stop the server');
      await opener(url);
    } catch (err) {
      logger.error(`Failed to open browser: ${String(err)}`);
    }
  };

  if (browserBehavior === BrowserBehavior.ASK) {
    const shouldOpen = await promptYesNo('Open URL in browser?', false);
    if (shouldOpen) {
      await doOpen();
    }
  } else if (browserBehavior !== BrowserBehavior.SKIP) {
    await doOpen();
  }
}
