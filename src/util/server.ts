import opener from 'opener';
import { VERSION, getDefaultPort } from '../constants';
import logger from '../logger';
import { promptYesNo } from './readline';

export enum BrowserBehavior {
  ASK = 0,
  OPEN = 1,
  SKIP = 2,
  OPEN_TO_REPORT = 3,
  OPEN_TO_REDTEAM_CREATE = 4,
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
