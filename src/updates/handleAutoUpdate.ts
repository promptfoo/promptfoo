import { spawn as nodeSpawn } from 'node:child_process';
import type { spawn } from 'node:child_process';

import { getInstallationInfo } from './installationInfo';
import {
  getUpdateSpawnContext,
  parseUpdateCommandForSpawn,
  withTargetVersion,
} from './updateCommandUtils';
import { updateEventEmitter } from './updateEventEmitter';

import type { UpdateObject } from './updateCheck';

export const AUTO_UPDATE_TIMEOUT_MS = 60_000;

export async function handleAutoUpdate(
  info: UpdateObject | null,
  disableUpdateNag: boolean,
  disableAutoUpdate: boolean,
  projectRoot: string,
  spawnFn: typeof spawn = nodeSpawn,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
) {
  if (!info) {
    return;
  }

  if (disableUpdateNag) {
    return;
  }

  // Automatic replacement is supported only on the Unix platforms covered by this feature.
  const supportsAutoUpdate = process.platform === 'darwin' || process.platform === 'linux';
  const autoUpdateDisabled = disableAutoUpdate || !supportsAutoUpdate;
  const installationInfo = getInstallationInfo(projectRoot, autoUpdateDisabled, sourceEnvironment);

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  updateEventEmitter.emit('update-received', {
    message: combinedMessage,
  });

  if (!installationInfo.updateCommand || autoUpdateDisabled) {
    return;
  }

  const updateCommand = withTargetVersion(installationInfo.updateCommand, info.update.latest);
  const { command, args } = parseUpdateCommandForSpawn(updateCommand, sourceEnvironment);
  const spawnContext = getUpdateSpawnContext(sourceEnvironment);

  const updateProcess = spawnFn(command, args, {
    ...spawnContext,
    stdio: 'ignore',
    shell: false,
    detached: false,
  });

  await new Promise<void>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      updateProcess.unref();
      finish('background', null);
    }, AUTO_UPDATE_TIMEOUT_MS);
    const finish = (event: 'close' | 'error' | 'background', detail: number | Error | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);

      if (event === 'close' && detail === 0) {
        updateEventEmitter.emit('update-success', {
          message: 'Update successful! The new version will be used on your next run.',
        });
      } else if (event === 'close') {
        updateEventEmitter.emit('update-failed', {
          message: `Automatic update failed with exit code ${detail}. Please try updating manually: ${installationInfo.updateCommand}`,
        });
      } else if (event === 'error') {
        const errorName = detail instanceof Error ? detail.name : 'Error';
        updateEventEmitter.emit('update-failed', {
          message: `Automatic update failed (${errorName}). Please try updating manually: ${installationInfo.updateCommand}`,
        });
      } else if (event === 'background') {
        updateEventEmitter.emit('update-background', {
          message: `Automatic update is still running after ${AUTO_UPDATE_TIMEOUT_MS / 1000} seconds and will continue in the background. Wait before running promptfoo again; installation success is not yet known.`,
        });
      }
      resolve();
    };

    updateProcess.on('close', (code) => {
      finish('close', code);
    });
    updateProcess.on('error', (err) => {
      finish('error', err);
    });
  });
}

export interface UpdateEventHandler {
  (info: { message: string }): void;
}

export function setUpdateHandler(
  onUpdateReceived: UpdateEventHandler,
  onUpdateSuccess: UpdateEventHandler,
  onUpdateFailed: UpdateEventHandler,
  onUpdateBackground: UpdateEventHandler = onUpdateFailed,
) {
  let shouldRepeatReminder = false;
  let reminderTimer: NodeJS.Timeout | undefined;

  const handleUpdateReceived = (info: { message: string }) => {
    shouldRepeatReminder = true;
    onUpdateReceived(info);
    const savedMessage = info.message;
    if (reminderTimer) {
      clearTimeout(reminderTimer);
    }
    // Use unref() so timer doesn't keep event loop alive and block CLI exit
    reminderTimer = setTimeout(() => {
      if (shouldRepeatReminder) {
        onUpdateReceived({ message: savedMessage });
      }
    }, 60000).unref();
  };

  const handleUpdateFailed = (info: { message: string }) => {
    shouldRepeatReminder = false;
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = undefined;
    }
    onUpdateFailed(info);
  };

  const handleUpdateSuccess = (info: { message: string }) => {
    shouldRepeatReminder = false;
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = undefined;
    }
    onUpdateSuccess(info);
  };

  const handleUpdateBackground = (info: { message: string }) => {
    // Do not repeat the availability reminder after reporting that installation is in progress.
    shouldRepeatReminder = false;
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = undefined;
    }
    onUpdateBackground(info);
  };

  updateEventEmitter.on('update-received', handleUpdateReceived);
  updateEventEmitter.on('update-failed', handleUpdateFailed);
  updateEventEmitter.on('update-success', handleUpdateSuccess);
  updateEventEmitter.on('update-background', handleUpdateBackground);

  return () => {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
      reminderTimer = undefined;
    }
    updateEventEmitter.off('update-received', handleUpdateReceived);
    updateEventEmitter.off('update-failed', handleUpdateFailed);
    updateEventEmitter.off('update-success', handleUpdateSuccess);
    updateEventEmitter.off('update-background', handleUpdateBackground);
  };
}
