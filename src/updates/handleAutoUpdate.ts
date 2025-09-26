import type { spawn } from 'node:child_process';
import { spawn as nodeSpawn } from 'node:child_process';
import type { UpdateObject } from './updateCheck';
import { getInstallationInfo } from './installationInfo';
import { updateEventEmitter } from './updateEventEmitter';

export function handleAutoUpdate(
  info: UpdateObject | null,
  disableUpdateNag: boolean,
  disableAutoUpdate: boolean,
  projectRoot: string,
  spawnFn: typeof spawn = nodeSpawn,
) {
  if (!info) {
    return;
  }

  if (disableUpdateNag) {
    return;
  }

  const installationInfo = getInstallationInfo(projectRoot, disableAutoUpdate);

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  updateEventEmitter.emit('update-received', {
    message: combinedMessage,
  });

  if (!installationInfo.updateCommand || disableAutoUpdate) {
    return;
  }

  const updateCommand = installationInfo.updateCommand.replace(
    '@latest',
    `@${info.update.latest}`,
  );

  const updateProcess = spawnFn(updateCommand, { stdio: 'pipe', shell: true });
  let errorOutput = '';

  updateProcess.stderr?.on('data', (data) => {
    errorOutput += data.toString();
  });

  updateProcess.on('close', (code) => {
    if (code === 0) {
      updateEventEmitter.emit('update-success', {
        message:
          'Update successful! The new version will be used on your next run.',
      });
    } else {
      updateEventEmitter.emit('update-failed', {
        message: `Automatic update failed. Please try updating manually. (command: ${updateCommand}, stderr: ${errorOutput.trim()})`,
      });
    }
  });

  updateProcess.on('error', (err) => {
    updateEventEmitter.emit('update-failed', {
      message: `Automatic update failed. Please try updating manually. (error: ${err.message})`,
    });
  });

  return updateProcess;
}

export interface UpdateEventHandler {
  (info: { message: string }): void;
}

export function setUpdateHandler(
  onUpdateReceived: UpdateEventHandler,
  onUpdateSuccess: UpdateEventHandler,
  onUpdateFailed: UpdateEventHandler,
) {
  let successfullyInstalled = false;

  const handleUpdateReceived = (info: { message: string }) => {
    onUpdateReceived(info);
    const savedMessage = info.message;
    setTimeout(() => {
      if (!successfullyInstalled) {
        onUpdateReceived({ message: savedMessage });
      }
    }, 60000);
  };

  const handleUpdateFailed = (info: { message: string }) => {
    onUpdateFailed(info);
  };

  const handleUpdateSuccess = (info: { message: string }) => {
    successfullyInstalled = true;
    onUpdateSuccess(info);
  };

  updateEventEmitter.on('update-received', handleUpdateReceived);
  updateEventEmitter.on('update-failed', handleUpdateFailed);
  updateEventEmitter.on('update-success', handleUpdateSuccess);

  return () => {
    updateEventEmitter.off('update-received', handleUpdateReceived);
    updateEventEmitter.off('update-failed', handleUpdateFailed);
    updateEventEmitter.off('update-success', handleUpdateSuccess);
  };
}