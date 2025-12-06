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
  // Note: Simple split on spaces - doesn't handle quoted args, but our commands don't need that
  const commandParts = updateCommand.split(' ');
  const command = commandParts[0];
  const args = commandParts.slice(1);

  // Use 'ignore' to prevent deadlocks from pipe buffer filling
  // Use 'detached' so the process can continue after parent exits (especially on Windows)
  // The update runs in background, we don't need to capture output
  const updateProcess = spawnFn(command, args, {
    stdio: 'ignore',
    shell: false,
    detached: true,
  });

  // Unref the process so it doesn't keep the event loop alive
  // This allows the CLI to exit normally even if update is still running
  updateProcess.unref();

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
  let reminderTimer: NodeJS.Timeout | undefined;

  const handleUpdateReceived = (info: { message: string }) => {
    onUpdateReceived(info);
    const savedMessage = info.message;
    // Use unref() so timer doesn't keep event loop alive and block CLI exit
    reminderTimer = setTimeout(() => {
      if (!successfullyInstalled) {
        onUpdateReceived({ message: savedMessage });
      }
    }, 60000).unref();
  };

  const handleUpdateFailed = (info: { message: string }) => {
    successfullyInstalled = true; // Don't show reminders if update failed
    if (reminderTimer) {
      clearTimeout(reminderTimer);
    }
    onUpdateFailed(info);
  };

  const handleUpdateSuccess = (info: { message: string }) => {
    successfullyInstalled = true;
    if (reminderTimer) {
      clearTimeout(reminderTimer);
    }
    onUpdateSuccess(info);
  };

  updateEventEmitter.on('update-received', handleUpdateReceived);
  updateEventEmitter.on('update-failed', handleUpdateFailed);
  updateEventEmitter.on('update-success', handleUpdateSuccess);

  return () => {
    if (reminderTimer) {
      clearTimeout(reminderTimer);
    }
    updateEventEmitter.off('update-received', handleUpdateReceived);
    updateEventEmitter.off('update-failed', handleUpdateFailed);
    updateEventEmitter.off('update-success', handleUpdateSuccess);
  };
}
