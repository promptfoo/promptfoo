/**
 * Scan Request Building and Execution
 *
 * Handles building scan requests and executing them via the agent client.
 */

import type ora from 'ora';

import type {
  FileRecord,
  GitMetadata,
  PullRequestContext,
  ScanRequest,
  ScanResponse,
} from '../../types/codeScan';
import type { Config } from '../config/schema';
import type { AgentClient } from './socket';

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
 * Execute scan request via agent client
 *
 * Uses the agent lifecycle protocol:
 * - client.start(request) → emits agent:start
 * - client.onComplete(cb) → listens agent:complete
 * - client.onError(cb) → listens agent:error
 * - client.cancel() → emits agent:cancel
 *
 * @param client - Connected agent client
 * @param request - Scan request to send
 * @param options - Execution options
 * @returns Promise resolving to scan response
 * @throws Error if scan fails, connection lost, or user cancels
 */
export async function executeScanRequest(
  client: AgentClient,
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
    const cleanupTimers = () => {
      if (firstPulseTimeout) {
        clearTimeout(firstPulseTimeout);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };

    // Set up event listeners using agent lifecycle
    client.onComplete((response: unknown) => {
      cleanupTimers();
      abortController.signal.removeEventListener('abort', onAbort);
      client.socket.off('reconnect_failed', onReconnectFailed);
      resolve(response as ScanResponse);
    });

    client.onError((error: { type: string; message: string }) => {
      cleanupTimers();
      abortController.signal.removeEventListener('abort', onAbort);
      client.socket.off('reconnect_failed', onReconnectFailed);
      reject(new Error(error.message || error.type));
    });

    const onReconnectFailed = () => {
      cleanupTimers();
      abortController.signal.removeEventListener('abort', onAbort);
      reject(new Error('Lost connection to server during scan'));
    };

    const onAbort = () => {
      // Emit cancellation to server
      client.cancel();
      cleanupTimers();
      client.socket.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      reject(new Error('cancelled by user'));
    };

    client.socket.on('reconnect_failed', onReconnectFailed);
    abortController.signal.addEventListener('abort', onAbort);

    // Emit scan request using agent lifecycle
    client.start(request);
  });

  return scanResponse;
}
