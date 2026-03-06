/**
 * Scan Request Building and Execution
 *
 * Handles building scan requests and executing them via the agent client.
 */

import logger from '../../logger';
import { sleepWithAbort } from '../../util/time';
import type ora from 'ora';

import type {
  FileRecord,
  GitMetadata,
  PullRequestContext,
  ScanRequest,
  ScanResponse,
} from '../../types/codeScan';
import type { AgentClient } from '../../util/agent/agentClient';
import type { Config } from '../config/schema';

// Capacity error detection and retry configuration
const CAPACITY_ERROR_MESSAGE = 'Server at capacity';
const MAX_RETRIES = 7;
const BASE_DELAY_MS = 1000;

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
      client.socket.io.off('reconnect_failed', onReconnectFailed);
      resolve(response as ScanResponse);
    });

    client.onError((error: { type: string; message: string }) => {
      cleanupTimers();
      abortController.signal.removeEventListener('abort', onAbort);
      client.socket.io.off('reconnect_failed', onReconnectFailed);
      reject(new Error(error.message || error.type));
    });

    client.onCancelled(() => {
      cleanupTimers();
      abortController.signal.removeEventListener('abort', onAbort);
      client.socket.io.off('reconnect_failed', onReconnectFailed);
      reject(new Error('Scan cancelled by server'));
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
      client.socket.io.off('reconnect_failed', onReconnectFailed);
      abortController.signal.removeEventListener('abort', onAbort);
      reject(new Error('cancelled by user'));
    };

    // reconnect_failed is emitted by the Socket.IO Manager, not the Socket instance
    client.socket.io.once('reconnect_failed', onReconnectFailed);
    abortController.signal.addEventListener('abort', onAbort);

    // Emit scan request using agent lifecycle
    client.start(request);
  });

  return scanResponse;
}

/**
 * Check if error is a server capacity error
 */
function isCapacityError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes(CAPACITY_ERROR_MESSAGE);
  }
  return false;
}

/**
 * Execute scan request with retry for capacity errors
 *
 * When the server is at capacity, it returns "Server at capacity. Please retry."
 * This wrapper retries with exponential backoff + jitter to spread load.
 *
 * Backoff schedule: ~1s, ~2s, ~4s, ~8s, ~16s, ~32s (total ~63s max)
 *
 * @param client - Connected agent client
 * @param request - Scan request to send
 * @param options - Execution options
 * @returns Promise resolving to scan response
 * @throws Error if scan fails after all retries
 */
export async function executeScanRequestWithRetry(
  client: AgentClient,
  request: ScanRequest,
  options: ScanExecutionOptions,
): Promise<ScanResponse> {
  const { showSpinner, spinner } = options;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await executeScanRequest(client, request, options);
    } catch (error) {
      // Only retry capacity errors, not other failures
      if (!isCapacityError(error)) {
        throw error;
      }

      // On last attempt, throw the error
      if (attempt === MAX_RETRIES - 1) {
        throw error;
      }

      // Exponential backoff with jitter: base * 2^attempt * (0.7 to 1.3)
      const jitter = 0.7 + 0.6 * Math.random();
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) * jitter;

      logger.debug(
        `Server busy, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );

      // Update spinner during retry wait (abort-aware)
      if (showSpinner && spinner) {
        const originalText = spinner.text;
        spinner.text = `Server busy, retrying in ${Math.round(delay / 1000)}s...`;
        await sleepWithAbort(delay, options.abortController.signal);
        spinner.text = originalText;
      } else {
        await sleepWithAbort(delay, options.abortController.signal);
      }
    }
  }

  // TypeScript: This should never be reached due to throw on last attempt
  throw new Error('Scan failed: exceeded maximum retries');
}
