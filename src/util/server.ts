import opener from 'opener';
import readline from 'readline';
import { VERSION, DEFAULT_PORT } from '../constants';
import logger from '../logger';
import { BrowserBehavior } from '../server/server';

export async function checkServerRunning(port = DEFAULT_PORT): Promise<boolean> {
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
  port = DEFAULT_PORT,
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
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Open URL in browser? (y/N): ', async (answer) => {
      if (answer.toLowerCase().startsWith('y')) {
        await doOpen();
      }
      rl.close();
    });
  } else if (browserBehavior !== BrowserBehavior.SKIP) {
    await doOpen();
  }
}
