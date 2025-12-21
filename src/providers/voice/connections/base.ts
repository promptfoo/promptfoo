/**
 * Base Voice Connection
 *
 * Abstract base class for voice provider WebSocket connections.
 * Provides common functionality for connection lifecycle, message routing,
 * and event handling.
 */

import { EventEmitter } from 'events';

import logger from '../../../logger';
import type WebSocket from 'ws';

import type { AudioChunk, VoiceConnectionEvents, VoiceProviderConfig } from '../types';

/**
 * Connection state.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'ready' | 'error';

/**
 * Abstract base class for voice provider connections.
 *
 * Subclasses must implement:
 * - connect(): Establish WebSocket connection
 * - configureSession(): Configure the voice session
 * - sendAudio(): Send audio chunk to the provider
 * - commitAudio(): Commit audio buffer (signal end of input)
 * - requestResponse(): Request a response from the provider
 * - handleMessage(): Process incoming WebSocket messages
 */
export abstract class BaseVoiceConnection extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected sessionId: string | null = null;
  protected state: ConnectionState = 'disconnected';
  protected config: VoiceProviderConfig;
  protected connectionTimeout: NodeJS.Timeout | null = null;
  protected pingInterval: NodeJS.Timeout | null = null;

  constructor(config: VoiceProviderConfig) {
    super();
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────────
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ─────────────────────────────────────────────────────────────

  /**
   * Establish the WebSocket connection.
   * Should resolve when the connection is open (but not necessarily configured).
   */
  abstract connect(): Promise<void>;

  /**
   * Configure the voice session after connection.
   * Should resolve when the session is ready to use.
   */
  abstract configureSession(): Promise<void>;

  /**
   * Send an audio chunk to the provider.
   */
  abstract sendAudio(chunk: AudioChunk): void;

  /**
   * Commit the audio buffer (signal end of input for this turn).
   */
  abstract commitAudio(): void;

  /**
   * Request a response from the provider.
   */
  abstract requestResponse(): void;

  /**
   * Cancel the current response.
   * Not all providers support this.
   */
  cancelResponse(): void {
    // Default implementation does nothing
  }

  /**
   * Clear the audio buffer.
   * Not all providers support this.
   */
  clearAudioBuffer(): void {
    // Default implementation does nothing
  }

  /**
   * Handle incoming WebSocket messages.
   * Should parse messages and emit appropriate events.
   */
  protected abstract handleMessage(data: Buffer | string): void;

  // ─────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * Disconnect from the provider.
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.state = 'disconnected';
    this.sessionId = null;
  }

  /**
   * Check if connected and ready.
   */
  isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Check if connected (may not be ready yet).
   */
  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'ready';
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get the provider configuration.
   */
  getConfig(): VoiceProviderConfig {
    return this.config;
  }

  /**
   * Update the configuration.
   * Note: This does not reconfigure the session.
   */
  updateConfig(config: Partial<VoiceProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ─────────────────────────────────────────────────────────────
  // PROTECTED METHODS - For use by subclasses
  // ─────────────────────────────────────────────────────────────

  /**
   * Set up common WebSocket event handlers.
   */
  protected setupWebSocketHandlers(ws: WebSocket): void {
    ws.on('message', (data: Buffer | string) => {
      try {
        this.handleMessage(data);
      } catch (error) {
        logger.error('[VoiceConnection] Error handling message:', { error });
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      logger.debug('[VoiceConnection] WebSocket closed:', {
        code,
        reason: reason.toString(),
      });
      this.state = 'disconnected';
      this.emit('close');
    });

    ws.on('error', (error: Error) => {
      logger.error('[VoiceConnection] WebSocket error:', { error });
      this.handleError(error);
    });

    ws.on('ping', () => {
      ws.pong();
    });
  }

  /**
   * Send a JSON message over the WebSocket.
   */
  protected send(message: object): boolean {
    if (!this.ws || this.ws.readyState !== 1) {
      // 1 = OPEN
      logger.warn('[VoiceConnection] Cannot send - WebSocket not open');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('[VoiceConnection] Error sending message:', { error });
      return false;
    }
  }

  /**
   * Handle an error.
   */
  protected handleError(error: Error): void {
    this.state = 'error';
    this.emit('error', error);
  }

  /**
   * Mark the connection as ready.
   */
  protected setReady(): void {
    this.state = 'ready';
    this.emit('ready');
  }

  /**
   * Set a connection timeout.
   */
  protected setConnectionTimeout(ms: number): void {
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this.state === 'connecting') {
        this.handleError(new Error('Connection timeout'));
        this.disconnect();
      }
    }, ms);
  }

  /**
   * Clear the connection timeout.
   */
  protected clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Start a ping interval to keep the connection alive.
   */
  protected startPingInterval(intervalMs: number = 30000): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.ping();
      }
    }, intervalMs);
  }

  /**
   * Stop the ping interval.
   */
  protected stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Clear all timers.
   */
  protected clearTimers(): void {
    this.clearConnectionTimeout();
    this.stopPingInterval();
  }

  /**
   * Get the API key from config or environment.
   */
  protected getApiKey(): string {
    if (this.config.apiKey) {
      return this.config.apiKey;
    }

    // Try provider-specific env vars
    switch (this.config.provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY || '';
      case 'google':
        return process.env.GOOGLE_API_KEY || '';
      default:
        return '';
    }
  }

  /**
   * Emit a typed event.
   */
  emit<K extends keyof VoiceConnectionEvents>(
    event: K,
    ...args: Parameters<VoiceConnectionEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Add a typed event listener.
   */
  on<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.on(event, listener);
  }

  /**
   * Add a one-time typed event listener.
   */
  once<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.once(event, listener);
  }

  /**
   * Remove a typed event listener.
   */
  off<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.off(event, listener);
  }
}

/**
 * Create a promise that resolves when an event is emitted.
 */
export function waitForEvent<T = void>(
  emitter: EventEmitter,
  event: string,
  timeoutMs: number = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    emitter.once(event, (value?: T) => {
      clearTimeout(timeout);
      resolve(value as T);
    });

    emitter.once('error', (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
