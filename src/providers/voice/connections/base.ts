import { EventEmitter } from 'events';

import logger from '../../../logger';
import type WebSocket from 'ws';

import type { AudioChunk, VoiceConnectionEvents, VoiceProviderConfig } from '../types';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'ready' | 'error';

export abstract class BaseVoiceConnection extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected sessionId: string | null = null;
  protected state: ConnectionState = 'disconnected';
  protected config: VoiceProviderConfig;
  protected connectionTimeout: NodeJS.Timeout | null = null;
  protected pingInterval: NodeJS.Timeout | null = null;
  private pendingConnectionReject: ((error: Error) => void) | null = null;

  constructor(config: VoiceProviderConfig) {
    super();
    this.config = config;
  }

  abstract connect(): Promise<void>;

  abstract configureSession(): Promise<void>;

  abstract sendAudio(chunk: AudioChunk): void;

  abstract commitAudio(): void | Promise<void>;

  abstract requestResponse(): void | Promise<void>;

  cancelResponse(): void {
    // Default implementation does nothing
  }

  clearAudioBuffer(): void {
    // Default implementation does nothing
  }

  protected abstract handleMessage(data: Buffer | string): void;

  disconnect(): void {
    const error = new Error('Voice connection disconnected');
    error.name = 'AbortError';
    this.rejectPendingConnection(error);
    this.clearTimers();
    this.state = 'disconnected';

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.sessionId = null;
    this.emit('close');
  }

  isReady(): boolean {
    return this.state === 'ready';
  }

  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'ready';
  }

  getState(): ConnectionState {
    return this.state;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getConfig(): VoiceProviderConfig {
    return this.config;
  }

  updateConfig(config: Partial<VoiceProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

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
      const wasConnecting = this.state === 'connecting';
      const wasDisconnected = this.state === 'disconnected';
      this.clearTimers();
      this.state = 'disconnected';
      if (wasConnecting) {
        const reasonText = reason.toString();
        const detail = reasonText ? `: ${reasonText}` : '';
        this.rejectPendingConnection(
          new Error(`WebSocket closed while connecting (${code})${detail}`),
        );
      }
      if (!wasDisconnected) {
        this.emit('close');
      }
    });

    ws.on('error', (error: Error) => {
      logger.error('[VoiceConnection] WebSocket error:', { error });
      this.handleError(error);
    });

    ws.on('ping', () => {
      ws.pong();
    });
  }

  protected send(message: object): boolean {
    if (!this.ws || this.ws.readyState !== 1) {
      // 1 = OPEN
      this.handleError(new Error('Cannot send voice data: WebSocket not open'));
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  protected handleError(error: Error): void {
    this.rejectPendingConnection(error);
    this.clearConnectionTimeout();
    this.state = 'error';
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
  }

  protected setReady(): void {
    this.state = 'ready';
    this.emit('ready');
  }

  protected setConnectionTimeout(ms: number, onTimeout?: (error: Error) => void): void {
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      if (this.state === 'connecting') {
        const error = new Error('Connection timeout');
        onTimeout?.(error);
        this.handleError(error);
        this.disconnect();
      }
    }, ms);
  }

  protected setPendingConnectionReject(reject: (error: Error) => void): void {
    this.pendingConnectionReject = reject;
  }

  protected clearPendingConnectionReject(): void {
    this.pendingConnectionReject = null;
  }

  private rejectPendingConnection(error: Error): void {
    const reject = this.pendingConnectionReject;
    this.pendingConnectionReject = null;
    reject?.(error);
  }

  protected clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  protected startPingInterval(intervalMs: number = 30000): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.ping();
      }
    }, intervalMs);
  }

  protected stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  protected clearTimers(): void {
    this.clearConnectionTimeout();
    this.stopPingInterval();
  }

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

  emit<K extends keyof VoiceConnectionEvents>(
    event: K,
    ...args: Parameters<VoiceConnectionEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.on(event, listener);
  }

  once<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.once(event, listener);
  }

  off<K extends keyof VoiceConnectionEvents>(event: K, listener: VoiceConnectionEvents[K]): this {
    return super.off(event, listener);
  }
}

export function waitForEvent<T = void>(
  emitter: EventEmitter,
  event: string,
  timeoutMs: number = 10000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      emitter.removeListener(event, onEvent);
      emitter.removeListener('error', onError);
      emitter.removeListener('close', onClose);
    };
    const onEvent = (value: T) => {
      cleanup();
      resolve(value);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => onError(new Error(`Connection closed while waiting for ${event}`));
    const timeout = setTimeout(
      () => onError(new Error(`Timeout waiting for event: ${event}`)),
      timeoutMs,
    );
    emitter.once(event, onEvent);
    emitter.once('error', onError);
    emitter.once('close', onClose);
  });
}
