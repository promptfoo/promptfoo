/**
 * Socket.IO Connection Management
 *
 * Handles creation and configuration of Socket.IO connections for code scanning.
 */

import { io, type Socket } from 'socket.io-client';
import logger from '../../logger';

import type { SocketAuthCredentials } from '../../types/codeScan';

/**
 * Create and configure Socket.IO connection
 *
 * @param apiHost - API host URL to connect to
 * @param auth - Authentication credentials
 * @returns Promise resolving to connected Socket
 * @throws Error if connection fails or times out
 */
export async function createSocketConnection(
  apiHost: string,
  auth: SocketAuthCredentials,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    logger.debug(`Connecting to ${apiHost}...`);
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId); // Clear the connection timeout
      socket.io.reconnection(false); // Stop any reconnection attempts
      socket.removeAllListeners();
      socket.close();
    };

    const socket = io(apiHost, {
      // Use websocket-only transport (polling requires sticky sessions)
      transports: ['websocket'],
      // Enable reconnection with limits - will be used during scan phase
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
      auth,
    });

    // Connection success - return socket with reconnection enabled for scan phase
    socket.on('connect', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      logger.debug(`Socket.io connected (id: ${socket.id})`);
      resolve(socket);
    });

    // Connection error - fail immediately, cleanup to stop any reconnection attempts
    socket.on('connect_error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      // Don't log here - error will be shown in "Scan failed" message
      logger.debug(`Socket.io connection error: ${error.message}`);
      cleanup(); // Stop reconnection and close socket
      reject(new Error(`Failed to connect to server: ${error.message}`));
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
      logger.debug(`Socket.io disconnected: ${reason}`);
    });

    // Error handling
    socket.on('error', (error) => {
      // Log at debug level to avoid noise with spinner
      logger.debug(`Socket.io error: ${String(error)}`);
    });

    // Connection timeout - cleanup and reject
    const timeoutId = setTimeout(() => {
      if (!socket.connected && !settled) {
        settled = true;
        cleanup();
        reject(new Error('Connection timeout after 5 seconds'));
      }
    }, 5000);
  });
}
