/**
 * Client-side agent connection utility.
 *
 * Creates a Socket.IO client pre-configured for the agent protocol:
 * - Connects with agent name in handshake
 * - Joins a session room
 * - Provides typed lifecycle methods (start, cancel, onComplete, onError)
 * - Passes through domain-specific events via on()/emit()
 */

import { io, type Socket } from 'socket.io-client';

import logger from '../../logger';

import type { SocketAuthCredentials } from '../../types/codeScan';

export interface CreateAgentClientOptions {
  /** API host URL to connect to */
  host: string;
  /** Authentication credentials */
  auth: SocketAuthCredentials;
  /** Agent name — must match the agent name used on the server */
  agent: string;
  /** Session ID for room-based routing */
  sessionId: string;
  /** Connection timeout in ms (default: 5000) */
  timeoutMs?: number;
}

export interface AgentClient {
  /** Emit agent:start with the given payload */
  start(payload: unknown): void;
  /** Emit agent:cancel */
  cancel(): void;
  /** Listen for agent:complete */
  onComplete(cb: (data: unknown) => void): void;
  /** Listen for agent:error */
  onError(cb: (error: { error: string; message: string }) => void): void;

  /** Domain-specific event passthrough — listen */
  on(event: string, handler: (...args: any[]) => void): void;
  /** Domain-specific event passthrough — emit */
  emit(event: string, ...args: any[]): void;

  /** Disconnect the socket */
  disconnect(): void;
  /** The underlying Socket.IO socket (escape hatch) */
  socket: Socket;
}

/**
 * Create an agent client that connects to the shared Socket.IO server.
 *
 * @returns Promise that resolves to an AgentClient once connected and joined to a room.
 * @throws Error if connection fails or times out.
 */
export async function createAgentClient(opts: CreateAgentClientOptions): Promise<AgentClient> {
  const { host, auth, agent, sessionId, timeoutMs = 5000 } = opts;

  return new Promise<AgentClient>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.io.reconnection(false);
      socket.removeAllListeners();
      socket.close();
    };

    const socket = io(host, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
      auth: { agent, ...auth },
    });

    socket.on('connect', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);

      logger.debug(`Agent client connected (agent: ${agent}, id: ${socket.id})`);

      // Join the agent session room
      socket.emit('agent:join', { sessionId });

      const client: AgentClient = {
        start(payload: unknown): void {
          socket.emit('agent:start', payload);
        },

        cancel(): void {
          socket.emit('agent:cancel');
        },

        onComplete(cb: (data: unknown) => void): void {
          socket.on('agent:complete', cb);
        },

        onError(cb: (error: { error: string; message: string }) => void): void {
          socket.on('agent:error', cb);
        },

        on(event: string, handler: (...args: any[]) => void): void {
          socket.on(event, handler);
        },

        emit(event: string, ...args: any[]): void {
          socket.emit(event, ...args);
        },

        disconnect(): void {
          socket.disconnect();
        },

        socket,
      };

      resolve(client);
    });

    socket.on('connect_error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      logger.debug(`Agent client connection error: ${error.message}`);
      cleanup();
      reject(new Error(`Failed to connect to server: ${error.message}`));
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Agent client disconnected: ${reason}`);
    });

    socket.on('error', (error) => {
      logger.debug(`Agent client error: ${String(error)}`);
    });

    const timeoutId = setTimeout(() => {
      if (!socket.connected && !settled) {
        settled = true;
        cleanup();
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);
  });
}
