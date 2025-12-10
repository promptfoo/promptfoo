import WebSocket from 'ws';
import logger from '../../logger';
import { sanitizeObject } from '../../util/sanitizer';

export interface WebSocketClientConfig {
  apiKey: string;
  baseUrl?: string;
  keepAliveInterval?: number; // Interval for keepalive pings (ms)
}

export interface StreamingMessage {
  type: 'audio' | 'alignment' | 'flush' | 'error' | 'unknown';
  data?: any;
}

export class ElevenLabsWebSocketClient {
  private apiKey: string;
  private baseUrl: string;
  private keepAliveInterval: number;
  private ws: WebSocket | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private messageHandler: ((data: Buffer) => void) | null = null;

  constructor(config: WebSocketClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'wss://api.elevenlabs.io';
    this.keepAliveInterval = config.keepAliveInterval || 10000; // 10 seconds (API timeout is 20s)
  }

  async connect(endpoint: string, options?: Record<string, any>): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;

    logger.debug('[ElevenLabs WebSocket] Connecting', {
      url,
      options: sanitizeObject(options || {}),
    });

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        logger.debug('[ElevenLabs WebSocket] Connected');

        // Send initial configuration if provided
        if (options) {
          this.send(options);
        }

        // Start keepalive
        this.startKeepAlive();

        resolve();
      });

      this.ws.on('error', (error) => {
        logger.error('[ElevenLabs WebSocket] Error', { error: error.message });
        reject(error);
      });

      this.ws.on('close', () => {
        logger.debug('[ElevenLabs WebSocket] Closed');
        this.stopKeepAlive();
      });
    });
  }

  send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = JSON.stringify(data);

    logger.debug('[ElevenLabs WebSocket] Sending message', {
      type: data.type || 'unknown',
      size: message.length,
    });

    this.ws.send(message);
  }

  sendText(text: string, flush = false): void {
    this.send({
      text,
      try_trigger_generation: true,
      flush,
    });
  }

  flush(): void {
    this.send({
      text: '',
      flush: true,
    });
  }

  onMessage(callback: (message: StreamingMessage) => void): void {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    // Remove previous handler to prevent multiple listeners
    if (this.messageHandler) {
      this.ws.removeListener('message', this.messageHandler);
    }

    // Create and store new handler
    this.messageHandler = (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString());

        if (parsed.audio) {
          callback({
            type: 'audio',
            data: parsed.audio, // Base64 encoded audio chunk
          });
        } else if (parsed.alignment) {
          callback({
            type: 'alignment',
            data: parsed.alignment, // Word-level timestamps
          });
        } else if (parsed.error) {
          callback({
            type: 'error',
            data: parsed.error,
          });
        } else {
          logger.debug('[ElevenLabs WebSocket] Received unknown message type', {
            keys: Object.keys(parsed),
          });
          callback({
            type: 'unknown',
            data: parsed,
          });
        }
      } catch (error) {
        logger.error('[ElevenLabs WebSocket] Failed to parse message', { error });
      }
    };

    this.ws.on('message', this.messageHandler);
  }

  close(): void {
    this.stopKeepAlive();

    if (this.ws) {
      // Remove message handler to prevent memory leaks
      if (this.messageHandler) {
        this.ws.removeListener('message', this.messageHandler);
        this.messageHandler = null;
      }
      this.ws.close();
      this.ws = null;
    }
  }

  private startKeepAlive(): void {
    this.keepAliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        logger.debug('[ElevenLabs WebSocket] Sending keepalive ping');
        this.ws.ping();
      }
    }, this.keepAliveInterval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
