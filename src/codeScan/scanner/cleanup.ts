/**
 * Cleanup and Signal Handling
 *
 * Manages graceful shutdown and resource cleanup for scan operations.
 */

import type { ChildProcess } from 'child_process';
import type { Socket } from 'socket.io-client';
import type ora from 'ora';
import logger from '../../logger';
import type { SocketIoMcpBridge } from '../mcp/transport';

/**
 * Mutable references for cleanup handlers
 * Allows signal handlers to access updated MCP resources
 */
export interface CleanupRefs {
  repoPath: string;
  socket: Socket | null;
  mcpBridge: SocketIoMcpBridge | null;
  mcpProcess: ChildProcess | null;
  spinner: ReturnType<typeof ora> | null;
  abortController: AbortController | null;
}

/**
 * Register cleanup handlers for process signals
 *
 * Handles SIGINT (Ctrl+C), SIGTERM, and SIGQUIT signals to ensure
 * graceful shutdown of resources (socket, MCP bridge, spinner).
 *
 * @param refs - Mutable references to resources that need cleanup
 */
export function registerCleanupHandlers(refs: CleanupRefs): void {
  const cleanup = (signal: string) => {
    // Stop spinner first for clean output
    if (refs.spinner?.isSpinning) {
      refs.spinner.stop();
    }

    logger.info(`\n\n⚠️  Received ${signal}, cleaning up...`);

    // Abort the scan Promise - this will trigger the catch/finally blocks
    // which handle all the actual resource cleanup
    if (refs.abortController) {
      refs.abortController.abort();
    }

    // Set exit code for SIGINT (standard is 130)
    process.exitCode = 130;

    // Let the Promise rejection flow through catch → finally → telemetry shutdown
    // The finally block will handle MCP and socket cleanup
  };

  // Register handlers for common termination signals
  // Use process.once() to prevent duplicate registrations
  process.once('SIGINT', () => cleanup('SIGINT')); // Ctrl+C
  process.once('SIGTERM', () => cleanup('SIGTERM')); // Termination signal
  process.once('SIGQUIT', () => cleanup('SIGQUIT')); // Quit signal
}
