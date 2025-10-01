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

  const updateCommand = installationInfo.updateCommand.replace('@latest', `@${info.update.latest}`);

  // Parse command into array to avoid shell injection
  // Example: "npm install -g promptfoo@1.2.3" -> ["npm", "install", "-g", "promptfoo@1.2.3"]
  const commandParts = updateCommand.split(' ');
  const command = commandParts[0];
  const args = commandParts.slice(1);

  const updateProcess = spawnFn(command, args, { stdio: 'pipe', shell: false });

  updateProcess.on('close', (code) => {
    if (code === 0) {
      updateEventEmitter.emit('update-success', {
        message: 'Update successful! The new version will be used on your next run.',
      });
    } else {
      // Sanitize error output by not including it (could contain secrets)
      updateEventEmitter.emit('update-failed', {
        message: `Automatic update failed with exit code ${code}. Please try updating manually: ${installationInfo.updateCommand}`,
      });
    }
  });

  updateProcess.on('error', (err) => {
    // Only include error name, not full message which might contain paths/secrets
    updateEventEmitter.emit('update-failed', {
      message: `Automatic update failed (${err.name}). Please try updating manually: ${installationInfo.updateCommand}`,
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
