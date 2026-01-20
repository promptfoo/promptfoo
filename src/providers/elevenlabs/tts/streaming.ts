import logger from '../../../logger';
import { ElevenLabsWebSocketClient, StreamingMessage } from '../websocket-client';

import type { StreamingChunk, TTSStreamConfig } from './types';

export interface StreamingSession {
  client: ElevenLabsWebSocketClient;
  chunks: StreamingChunk[];
  alignments: any[];
  errors: string[];
  startTime: number;
}

/**
 * Create a WebSocket connection for TTS streaming
 */
export async function createStreamingConnection(
  apiKey: string,
  voiceId: string,
  config: TTSStreamConfig,
): Promise<ElevenLabsWebSocketClient> {
  const client = new ElevenLabsWebSocketClient({
    apiKey,
    baseUrl: config.baseUrl || 'wss://api.elevenlabs.io',
    keepAliveInterval: config.keepAliveInterval,
  });

  // Connect to TTS streaming endpoint
  const endpoint = `/v1/text-to-speech/${voiceId}/stream-input?model_id=${config.modelId}`;

  // Initial configuration
  const streamConfig: Record<string, any> = {
    text: ' ',
    voice_settings: config.voiceSettings,
    generation_config: {
      chunk_length_schedule: config.chunkLengthSchedule || [120, 160, 250, 290],
    },
    xi_api_key: apiKey,
  };

  // Add pronunciation dictionary locators if provided
  if (config.pronunciationDictionaryLocators) {
    streamConfig.pronunciation_dictionary_locators = config.pronunciationDictionaryLocators;
  }

  await client.connect(endpoint, streamConfig);

  return client;
}

/**
 * Handle streaming TTS by sending text and collecting audio chunks
 */
export async function handleStreamingTTS(
  client: ElevenLabsWebSocketClient,
  text: string,
  onChunk?: (chunk: StreamingChunk) => void,
  startTime?: number,
): Promise<StreamingSession> {
  const sessionStart = startTime ?? Date.now();
  const session: StreamingSession = {
    client,
    chunks: [],
    alignments: [],
    errors: [],
    startTime: sessionStart,
  };

  return new Promise((resolve, reject) => {
    let completionTimeout: NodeJS.Timeout | undefined;
    const audioChunks: Buffer[] = [];
    let totalChunks = 0;

    // Set up message handler
    client.onMessage((message: StreamingMessage) => {
      // Reset timeout on any message
      if (completionTimeout) {
        clearTimeout(completionTimeout);
      }
      completionTimeout = setTimeout(() => {
        logger.debug('[ElevenLabs Streaming] Stream complete (timeout)');
        resolve(session);
      }, 2000); // 2 second silence = complete

      switch (message.type) {
        case 'audio': {
          const audioBuffer = Buffer.from(message.data, 'base64');
          audioChunks.push(audioBuffer);
          totalChunks++;

          const chunk: StreamingChunk = {
            audio: message.data,
            chunkIndex: totalChunks - 1,
            timestamp: Date.now(),
          };

          session.chunks.push(chunk);

          if (onChunk) {
            onChunk(chunk);
          }

          logger.debug('[ElevenLabs Streaming] Received audio chunk', {
            chunkIndex: chunk.chunkIndex,
            size: audioBuffer.length,
          });
          break;
        }

        case 'alignment': {
          session.alignments.push(message.data);
          logger.debug('[ElevenLabs Streaming] Received alignment data');
          break;
        }

        case 'error': {
          const errorMsg = message.data?.message || 'Unknown streaming error';
          session.errors.push(errorMsg);
          logger.error('[ElevenLabs Streaming] Error', { error: errorMsg });
          reject(new Error(errorMsg));
          break;
        }

        case 'flush': {
          logger.debug('[ElevenLabs Streaming] Received flush signal');
          resolve(session);
          break;
        }
      }
    });

    // Send the text for generation
    try {
      // Split text into smaller chunks for better streaming latency
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

      for (const sentence of sentences) {
        client.sendText(sentence.trim(), false);
      }

      // Send flush to signal end of input
      client.flush();

      logger.debug('[ElevenLabs Streaming] Text sent', {
        totalSentences: sentences.length,
        totalLength: text.length,
      });

      // Set initial timeout
      completionTimeout = setTimeout(() => {
        logger.debug('[ElevenLabs Streaming] Stream complete (initial timeout)');
        resolve(session);
      }, 5000); // 5 second initial timeout
    } catch (error) {
      if (completionTimeout) {
        clearTimeout(completionTimeout);
      }
      reject(error);
    }
  });
}

/**
 * Combine streaming chunks into a single audio buffer
 */
export function combineStreamingChunks(chunks: StreamingChunk[]): Buffer {
  const buffers = chunks.map((chunk) => Buffer.from(chunk.audio, 'base64'));
  return Buffer.concat(buffers);
}

/**
 * Calculate streaming metrics
 */
export function calculateStreamingMetrics(session: StreamingSession, textLength: number) {
  if (session.chunks.length === 0) {
    return {
      totalChunks: 0,
      firstChunkLatency: 0,
      totalLatency: 0,
      avgChunkLatency: 0,
      charactersPerSecond: 0,
    };
  }

  const firstChunk = session.chunks[0];
  const lastChunk = session.chunks[session.chunks.length - 1];

  const firstChunkLatency = firstChunk.timestamp - session.startTime;
  const totalLatency = lastChunk.timestamp - session.startTime;
  const avgChunkLatency = totalLatency / session.chunks.length;
  const charactersPerSecond = totalLatency > 0 ? (textLength / totalLatency) * 1000 : 0;

  return {
    totalChunks: session.chunks.length,
    firstChunkLatency,
    totalLatency,
    avgChunkLatency,
    charactersPerSecond,
  };
}
