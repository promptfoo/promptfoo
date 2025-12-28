/**
 * Scan Request Building and Execution
 *
 * Handles building scan requests and executing them via Socket.IO.
 */

import type ora from 'ora';
import type { Socket } from 'socket.io-client';

import type {
  FileRecord,
  GitMetadata,
  PullRequestContext,
  ScanRequest,
  ScanResponse,
} from '../../types/codeScan';
import type { Config } from '../config/schema';

/**
 * Options for scan execution
 */
export interface ScanExecutionOptions {
  showSpinner: boolean;
  spinner?: ReturnType<typeof ora>;
  abortController: AbortController;
}

/**
 * Build scan request from inputs
 *
 * @param files - Files to scan
 * @param metadata - Git metadata
 * @param config - Scan configuration
 * @param sessionId - Session ID for scan tracking and cancellation
 * @param pullRequest - Optional PR context
 * @param guidance - Optional custom guidance
 * @returns Scan request object
 */
export function buildScanRequest(
  files: FileRecord[],
  metadata: GitMetadata,
  config: Config,
  sessionId: string,
  pullRequest?: PullRequestContext,
  guidance?: string,
): ScanRequest {
  return {
    files,
    metadata,
    config: {
      minimumSeverity: config.minimumSeverity,
      diffsOnly: config.diffsOnly,
      guidance,
    },
    sessionId, // Always included for scan tracking and cancellation
    pullRequest, // Include PR context if --github-pr flag provided
  };
}

/**
 * Execute scan request via Socket.IO
 *
 * @param socket - Connected Socket.IO socket
 * @param request - Scan request to send
 * @param options - Execution options
 * @returns Promise resolving to scan response
 * @throws Error if scan fails, connection lost, or user cancels
 */
export async function executeScanRequest(
  socket: Socket,
  request: ScanRequest,
  options: ScanExecutionOptions,
): Promise<ScanResponse> {
  const { showSpinner, spinner, abortController } = options;

  // Update spinner
  if (showSpinner && spinner) {
    spinner.text = 'Scanning...';
  }

  // Add heartbeat to show progress during long scans
  let heartbeatInterval: NodeJS.Timeout | undefined;
  let firstPulseTimeout: NodeJS.Timeout | undefined;
  if (showSpinner && spinner) {
    const pulse = () => {
      // Show "Still scanning..." for 4 seconds
      spinner!.text = 'Still scanning...';
      setTimeout(() => {
        if (spinner?.isSpinning) {
          spinner.text = 'Scanning...';
        }
      }, 4000);
    };

    // First pulse at 8 seconds
    firstPulseTimeout = setTimeout(() => {
      pulse();
      // Then pulse every 12 seconds (8s "Scanning..." + 4s "Still scanning...")
      heartbeatInterval = setInterval(pulse, 12000);
    }, 8000);
  }

  // Send scan request and wait for response
  const scanResponse: ScanResponse = await new Promise((resolve, reject) => {
    // Set up event listeners
    const onComplete = (response: ScanResponse) => {
      socket?.off('scan:complete', onComplete);
      socket?.off('scan:error', onError);
      socket?.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      if (firstPulseTimeout) {
        clearTimeout(firstPulseTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      resolve(response);
    };

    const onError = (error: { success: false; error: string; message: string }) => {
      socket?.off('scan:complete', onComplete);
      socket?.off('scan:error', onError);
      socket?.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      if (firstPulseTimeout) {
        clearTimeout(firstPulseTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      reject(new Error(error.message || error.error));
    };

    const onReconnectFailed = () => {
      socket?.off('scan:complete', onComplete);
      socket?.off('scan:error', onError);
      socket?.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      if (firstPulseTimeout) {
        clearTimeout(firstPulseTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      reject(new Error('Lost connection to server during scan'));
    };

    const onAbort = () => {
      // Emit cancellation to server
      socket?.emit('scan:cancel');

      // Remove listeners
      socket?.off('scan:complete', onComplete);
      socket?.off('scan:error', onError);
      socket?.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      if (firstPulseTimeout) {
        clearTimeout(firstPulseTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      reject(new Error('cancelled by user'));
    };

    socket?.on('scan:complete', onComplete);
    socket?.on('scan:error', onError);
    socket?.on('reconnect_failed', onReconnectFailed);
    abortController.signal.addEventListener('abort', onAbort);

    // Emit scan request
    socket?.emit('scan:start', request);
  });

  return scanResponse;
}
