/**
 * Client-side agent connection utility.
 *
 * Creates a Socket.IO client pre-configured for the agent protocol:
 * - Connects with agent name in handshake
 * - Joins a session room
 * - Provides typed lifecycle methods (start, cancel, onComplete, onError)
 * - Passes through domain-specific events via on()/emit()
 */

import crypto from 'crypto';

import { io, type Socket } from 'socket.io-client';
import logger from '../../logger';
import { resolveBaseAuthCredentials } from './agentAuth';

import type { SocketAuthCredentials } from '../../types/codeScan';

// Import cloud config for default host resolution
let cloudConfig: { getApiHost(): string } | undefined;
try {
  const cloudModule = await import('../../globalConfig/cloud');
  cloudConfig = cloudModule.cloudConfig;
} catch (error: unknown) {
  // Only swallow MODULE_NOT_FOUND — other errors indicate real problems
  if (error instanceof Error && 'code' in error && (error as any).code === 'MODULE_NOT_FOUND') {
    // Cloud config not available — host must be provided explicitly
  } else {
    logger.debug(`Unexpected error loading cloud config: ${error}`);
  }
}

/**
 * Minimal structural type for Zod schemas — used for type inference only, no runtime use.
 * Avoids importing Zod as a dependency in the client.
 */
interface ZodLikeSchema {
  _zod: { output: unknown };
}

/** Infer the output type from a ZodLikeSchema, or fall back to `unknown`. */
type InferSchema<T> = T extends { _zod: { output: infer O } } ? O : unknown;

export interface CreateAgentClientOptions<
  TStartSchema extends ZodLikeSchema = ZodLikeSchema,
  TCompleteSchema extends ZodLikeSchema = ZodLikeSchema,
> {
  /** Agent name — must match the agent name used on the server */
  agent: string;
  /** API host URL override (default: resolved from cloud config) */
  host?: string;
  /** Auth credentials override (default: resolved from API key waterfall) */
  auth?: SocketAuthCredentials;
  /** Session ID override (default: generated UUID) */
  sessionId?: string;
  /** Connection timeout in ms (default: 5000) */
  timeoutMs?: number;
  /** Schema for start payload — used for type inference only (no runtime validation) */
  startMessageSchema?: TStartSchema;
  /** Schema for complete payload — used for type inference only (no runtime validation) */
  completeMessageSchema?: TCompleteSchema;
}

export interface AgentClient<
  TStartSchema extends ZodLikeSchema = ZodLikeSchema,
  TCompleteSchema extends ZodLikeSchema = ZodLikeSchema,
> {
  /** The session ID for this connection */
  readonly sessionId: string;
  /** Emit agent:start with the given payload */
  start(payload: InferSchema<TStartSchema>): void;
  /** Emit agent:cancel */
  cancel(): void;
  /** Listen for agent:complete */
  onComplete(cb: (data: InferSchema<TCompleteSchema>) => void): void;
  /** Listen for agent:error */
  onError(cb: (error: { type: string; message: string }) => void): void;
  /** Listen for agent:cancelled */
  onCancelled(cb: (data: { clientType: string }) => void): void;

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
 * Only `agent` is required. Host, auth, and sessionId are resolved automatically
 * but can be overridden for agents with custom needs.
 *
 * @returns Promise that resolves to an AgentClient once connected and joined to a room.
 * @throws Error if connection fails or times out.
 */
export async function createAgentClient<
  TStartSchema extends ZodLikeSchema = ZodLikeSchema,
  TCompleteSchema extends ZodLikeSchema = ZodLikeSchema,
>(
  opts: CreateAgentClientOptions<TStartSchema, TCompleteSchema>,
): Promise<AgentClient<TStartSchema, TCompleteSchema>> {
  const { agent, timeoutMs = 5000 } = opts;

  const host = opts.host ?? cloudConfig?.getApiHost();
  if (!host) {
    throw new Error('No API host available. Set PROMPTFOO_CLOUD_API_URL or pass host explicitly.');
  }

  const auth = opts.auth ?? resolveBaseAuthCredentials();
  const sessionId = opts.sessionId ?? crypto.randomUUID();

  return new Promise<AgentClient<TStartSchema, TCompleteSchema>>((resolve, reject) => {
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
      logger.debug(`Agent client connected (agent: ${agent}, id: ${socket.id})`);

      // Always re-join the session room on (re)connect
      socket.emit('agent:join', { sessionId });

      if (settled) {
        return; // Already resolved — don't resolve the promise twice
      }
      settled = true;
      clearTimeout(timeoutId);

      const client: AgentClient<TStartSchema, TCompleteSchema> = {
        sessionId,

        start(payload: InferSchema<TStartSchema>): void {
          socket.emit('agent:start', payload);
        },

        cancel(): void {
          socket.emit('agent:cancel');
        },

        onComplete(cb: (data: InferSchema<TCompleteSchema>) => void): void {
          socket.once('agent:complete', cb);
        },

        onError(cb: (error: { type: string; message: string }) => void): void {
          socket.once('agent:error', cb);
        },

        onCancelled(cb: (data: { clientType: string }) => void): void {
          socket.once('agent:cancelled', cb);
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

    socket.io.on('reconnect_failed', () => {
      logger.error(`Agent client reconnection failed after all attempts (agent: ${agent})`);
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
