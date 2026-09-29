import { getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { getInstallationInfo } from './installationInfo';
import { runNpmUpdate } from './updateCommandUtils';

import type { UpdateObject } from './updateCheck';

export const AUTO_UPDATE_TIMEOUT_MS = 60_000;

export function isAutoUpdateEnabled(sourceEnvironment: NodeJS.ProcessEnv): boolean {
  return (
    parseEnvBool(sourceEnvironment.PROMPTFOO_ENABLE_AUTO_UPDATE) &&
    !parseEnvBool(sourceEnvironment.PROMPTFOO_DISABLE_UPDATE) &&
    !getEnvBool('PROMPTFOO_DISABLE_UPDATE')
  );
}

export function trackUpdateInterruptions() {
  let interrupted = false;
  const signals = ['SIGINT', 'SIGTERM'] as const;
  const handlers = signals.map((signal) => {
    const handler = () => {
      interrupted = true;
      if (process.listenerCount(signal) === 1) {
        process.removeListener(signal, handler);
        // Restore Node's default signal exit when there is no command-specific handler.
        process.kill(process.pid, signal);
      }
    };
    process.prependListener(signal, handler);
    return handler;
  });
  return {
    wasInterrupted: () => interrupted,
    dispose: () =>
      signals.forEach((signal, index) => process.removeListener(signal, handlers[index])),
  };
}

export async function handleAutoUpdate(
  info: UpdateObject,
  projectRoot: string,
  sourceEnvironment: NodeJS.ProcessEnv,
) {
  if (!isAutoUpdateEnabled(sourceEnvironment)) {
    return;
  }
  try {
    const installation = getInstallationInfo(projectRoot, sourceEnvironment);
    if (!installation.canUpdate) {
      logger.info(installation.message);
      return;
    }
    logger.info(`Updating Promptfoo to ${info.update.latest}...`);
    const outcome = await runNpmUpdate(
      info.update.latest,
      sourceEnvironment,
      projectRoot,
      AUTO_UPDATE_TIMEOUT_MS,
    );
    if (outcome === 'complete') {
      logger.info('Promptfoo updated. The next command will use the new version.');
    } else {
      logger.warn(
        'The update is still running in the background. Wait before running Promptfoo again; installation success is not yet known.',
      );
    }
  } catch (error) {
    logger.warn(
      `Automatic update failed (${error instanceof Error ? error.name : 'Error'}). Run npm install -g promptfoo@latest to try again.`,
    );
  }
}
