/**
 * xAI Voice Agent API Provider
 *
 * Provides real-time voice conversations with Grok models via WebSocket.
 * WebSocket Endpoint: wss://api.x.ai/v1/realtime
 *
 * Pricing: $0.05/minute of connection time
 *
 * @see https://docs.x.ai/docs/guides/voice
 */

import WebSocket from 'ws';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util/index';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';

// ============================================================================
// Constants
// ============================================================================

export const XAI_VOICE_DEFAULT_API_URL = 'https://api.x.ai/v1';
export const XAI_VOICE_DEFAULT_WS_URL = 'wss://api.x.ai/v1/realtime';
export const XAI_VOICE_COST_PER_MINUTE = 0.05;

export const XAI_VOICE_DEFAULTS = {
  voice: 'Ara' as const,
  sampleRate: 24000,
  audioFormat: 'audio/pcm' as const,
  websocketTimeout: 30000,
};

export const XAI_VOICES = ['Ara', 'Rex', 'Sal', 'Eve', 'Leo'] as const;
export type XAIVoice = (typeof XAI_VOICES)[number];

export const XAI_AUDIO_FORMATS = ['audio/pcm', 'audio/pcmu', 'audio/pcma'] as const;
export type XAIAudioFormatType = (typeof XAI_AUDIO_FORMATS)[number];

export const XAI_SAMPLE_RATES = [8000, 16000, 22050, 24000, 32000, 44100, 48000] as const;
export type XAISampleRate = (typeof XAI_SAMPLE_RATES)[number];

// ============================================================================
// Types
// ============================================================================

/**
 * Audio format configuration for xAI Voice API
 */
export interface XAIAudioFormat {
  type: XAIAudioFormatType;
  rate?: XAISampleRate;
}

/**
 * xAI Voice tool types
 */
export interface XAIFileSearchTool {
  type: 'file_search';
  vector_store_ids: string[];
  max_num_results?: number;
}

export interface XAIWebSearchTool {
  type: 'web_search';
}

export interface XAIXSearchTool {
  type: 'x_search';
  allowed_x_handles?: string[];
}

export interface XAIFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type XAIVoiceTool = XAIFileSearchTool | XAIWebSearchTool | XAIXSearchTool | XAIFunctionTool;

/**
 * xAI Voice provider configuration options
 */
export interface XAIVoiceOptions {
  // Authentication
  apiKey?: string;

  // Custom endpoint configuration
  apiBaseUrl?: string; // Full base URL e.g., "https://my-proxy.com/v1"
  apiHost?: string; // Host only e.g., "my-proxy.com" → "https://my-proxy.com/v1"
  websocketUrl?: string; // Complete WebSocket URL override (used exactly as-is, no transformation)

  // Voice configuration
  voice?: XAIVoice;

  // System instructions
  instructions?: string;

  // Turn detection
  turn_detection?: {
    type: 'server_vad';
  } | null;

  // Audio format configuration
  audio?: {
    input?: { format: XAIAudioFormat };
    output?: { format: XAIAudioFormat };
  };

  // Response modalities
  modalities?: ('text' | 'audio')[];

  // Tool configuration
  tools?: XAIVoiceTool[];
  functionCallHandler?: (name: string, args: string) => Promise<string>;

  // Timeouts
  websocketTimeout?: number;
}

/**
 * WebSocket message interface
 */
interface WebSocketMessage {
  type: string;
  event_id?: string;
  [key: string]: unknown;
}

/**
 * Pending function call
 */
interface PendingFunctionCall {
  name: string;
  call_id: string;
  arguments: string;
}

/**
 * Function call information exposed in output for assertions
 */
export interface XAIFunctionCallOutput {
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert PCM16 audio data to WAV format for browser playback
 */
function convertPcm16ToWav(pcmData: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const wavHeader = Buffer.alloc(44);
  let offset = 0;

  // RIFF header
  wavHeader.write('RIFF', offset);
  offset += 4;
  wavHeader.writeUInt32LE(fileSize, offset);
  offset += 4;
  wavHeader.write('WAVE', offset);
  offset += 4;

  // fmt chunk
  wavHeader.write('fmt ', offset);
  offset += 4;
  wavHeader.writeUInt32LE(16, offset);
  offset += 4;
  wavHeader.writeUInt16LE(1, offset);
  offset += 2;
  wavHeader.writeUInt16LE(numChannels, offset);
  offset += 2;
  wavHeader.writeUInt32LE(sampleRate, offset);
  offset += 4;
  wavHeader.writeUInt32LE(byteRate, offset);
  offset += 4;
  wavHeader.writeUInt16LE(blockAlign, offset);
  offset += 2;
  wavHeader.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  // data chunk
  wavHeader.write('data', offset);
  offset += 4;
  wavHeader.writeUInt32LE(dataSize, offset);

  return Buffer.concat([wavHeader, pcmData]);
}

/**
 * Calculate xAI Voice API cost based on connection duration
 */
export function calculateXAIVoiceCost(durationMs: number): number {
  const durationMinutes = durationMs / 60000;
  return XAI_VOICE_COST_PER_MINUTE * durationMinutes;
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * xAI Voice Provider
 *
 * Provides real-time voice conversations with Grok models.
 *
 * Usage:
 *   xai:voice:grok-3
 *   xai:voice:grok-3-fast
 *   xai:voice:grok-4
 */
export class XAIVoiceProvider implements ApiProvider {
  modelName: string;
  config: XAIVoiceOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: XAIVoiceOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `xai:voice:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Voice Provider ${this.modelName}]`;
  }

  protected getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('XAI_API_KEY');
  }

  /**
   * Get the HTTP(S) API base URL
   * Priority: apiHost > apiBaseUrl > XAI_API_BASE_URL env > default
   */
  protected getApiUrl(): string {
    if (this.config.apiHost) {
      return `https://${this.config.apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.XAI_API_BASE_URL ||
      getEnvString('XAI_API_BASE_URL') ||
      XAI_VOICE_DEFAULT_API_URL
    );
  }

  /**
   * Convert HTTP(S) URL to WebSocket URL base
   */
  private getWebSocketBase(): string {
    const base = this.getApiUrl();
    const wsBase = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    return wsBase.replace(/\/+$/, '');
  }

  /**
   * Build full WebSocket URL for realtime endpoint
   * If websocketUrl is provided, use it exactly as-is without any transformation
   */
  protected getWebSocketUrl(): string {
    if (this.config.websocketUrl) {
      return this.config.websocketUrl;
    }
    return `${this.getWebSocketBase()}/realtime`;
  }

  /**
   * Build session configuration for xAI Voice API
   */
  private async buildSessionConfig(): Promise<object> {
    const inputFormat = this.config.audio?.input?.format || {
      type: XAI_VOICE_DEFAULTS.audioFormat,
      rate: XAI_VOICE_DEFAULTS.sampleRate,
    };
    const outputFormat = this.config.audio?.output?.format || {
      type: XAI_VOICE_DEFAULTS.audioFormat,
      rate: XAI_VOICE_DEFAULTS.sampleRate,
    };

    const session: Record<string, unknown> = {
      voice: this.config.voice || XAI_VOICE_DEFAULTS.voice,
      instructions: this.config.instructions || 'You are a helpful assistant.',
      turn_detection: this.config.turn_detection ?? { type: 'server_vad' },
      audio: {
        input: { format: inputFormat },
        output: { format: outputFormat },
      },
    };

    // Add tools if configured
    if (this.config.tools?.length) {
      const loadedTools = await maybeLoadToolsFromExternalFile(this.config.tools);
      if (loadedTools) {
        session.tools = loadedTools;
      }
    }

    return {
      type: 'session.update',
      session,
    };
  }

  /**
   * Main API call implementation
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'XAI_API_KEY is not set. Set the environment variable or add apiKey to the provider config.',
      };
    }

    // Apply function handler if provided in context
    if (
      context?.prompt?.config?.functionCallHandler &&
      typeof context.prompt.config.functionCallHandler === 'function'
    ) {
      this.config.functionCallHandler = context.prompt.config.functionCallHandler;
    }

    try {
      const result = await this.webSocketRequest(prompt);

      // Build output - if function calls exist, include them in output for assertions
      const hasFunctionCalls = result.functionCalls && result.functionCalls.length > 0;
      const output = hasFunctionCalls
        ? { text: result.output, functionCalls: result.functionCalls }
        : result.output;

      return {
        output,
        cost: result.cost,
        metadata: result.metadata,
        ...(result.audio && { audio: result.audio }),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[xAI Voice] Error: ${errorMessage}`);
      return {
        error: `xAI Voice error: ${errorMessage}`,
      };
    }
  }

  /**
   * WebSocket request implementation
   */
  private async webSocketRequest(prompt: string): Promise<{
    output: string;
    cost: number;
    metadata: Record<string, unknown>;
    functionCalls?: XAIFunctionCallOutput[];
    audio?: {
      data: string;
      format: string;
      transcript: string;
    };
  }> {
    return new Promise((resolve, reject) => {
      const connectionStartTime = Date.now();
      const wsUrl = this.getWebSocketUrl();

      logger.debug('[xAI Voice] Connecting to WebSocket', { url: wsUrl });

      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'User-Agent': 'promptfoo xAI Voice Client',
        },
        handshakeTimeout: 10000,
      });

      // Request timeout
      const timeout = setTimeout(() => {
        logger.error('[xAI Voice] WebSocket connection timed out');
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, this.config.websocketTimeout || XAI_VOICE_DEFAULTS.websocketTimeout);

      // State accumulators
      let responseTranscript = '';
      let responseDone = false;
      const audioChunks: Buffer[] = [];
      let hasAudioContent = false;
      let pendingFunctionCalls: PendingFunctionCall[] = [];
      const functionCallResults: string[] = [];
      const functionCallOutputs: XAIFunctionCallOutput[] = [];

      // Helper to send events
      const sendEvent = (event: Record<string, unknown>) => {
        if (!event.event_id) {
          event.event_id = generateEventId();
        }
        logger.debug('[xAI Voice] Sending event', { type: event.type });
        ws.send(JSON.stringify(event));
      };

      // Connection opened
      ws.on('open', async () => {
        logger.debug('[xAI Voice] WebSocket connected');

        // Configure session
        const sessionConfig = await this.buildSessionConfig();
        sendEvent(sessionConfig as Record<string, unknown>);

        // Send user message
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: prompt }],
          },
        });

        // Request response
        sendEvent({
          type: 'response.create',
          response: {
            modalities: this.config.modalities || ['text', 'audio'],
          },
        });
      });

      // Message handler
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.debug('[xAI Voice] Received message', { type: message.type });

          switch (message.type) {
            // Session lifecycle
            case 'conversation.created':
              logger.debug('[xAI Voice] Conversation created', {
                id: (message.conversation as { id?: string })?.id,
              });
              break;

            case 'session.updated':
              logger.debug('[xAI Voice] Session configured');
              break;

            // Transcript streaming
            case 'response.output_audio_transcript.delta':
              responseTranscript += message.delta as string;
              break;

            case 'response.output_audio_transcript.done':
              logger.debug('[xAI Voice] Transcript complete');
              break;

            // Audio streaming (xAI uses response.output_audio.delta)
            case 'response.output_audio.delta': {
              const audioData = message.delta as string;
              if (audioData && audioData.length > 0) {
                try {
                  const audioBuffer = Buffer.from(audioData, 'base64');
                  audioChunks.push(audioBuffer);
                  hasAudioContent = true;
                } catch (error) {
                  logger.error('[xAI Voice] Error processing audio chunk', { error });
                }
              }
              break;
            }

            case 'response.output_audio.done':
              logger.debug('[xAI Voice] Audio complete', {
                chunks: audioChunks.length,
              });
              break;

            // Function calls
            case 'response.function_call_arguments.done': {
              pendingFunctionCalls.push({
                name: message.name as string,
                call_id: message.call_id as string,
                arguments: message.arguments as string,
              });
              break;
            }

            // Response complete
            case 'response.done': {
              responseDone = true;

              // Handle pending function calls
              if (pendingFunctionCalls.length > 0) {
                for (const call of pendingFunctionCalls) {
                  let parsedArgs: Record<string, unknown> = {};
                  try {
                    parsedArgs = JSON.parse(call.arguments);
                  } catch {
                    logger.warn('[xAI Voice] Failed to parse function arguments', {
                      name: call.name,
                    });
                  }

                  if (this.config.functionCallHandler) {
                    try {
                      const result = await this.config.functionCallHandler(
                        call.name,
                        call.arguments,
                      );
                      functionCallResults.push(result);

                      // Track function call with full details for assertions
                      functionCallOutputs.push({
                        name: call.name,
                        arguments: parsedArgs,
                        result,
                      });

                      // Send function result back
                      sendEvent({
                        type: 'conversation.item.create',
                        item: {
                          type: 'function_call_output',
                          call_id: call.call_id,
                          output: result,
                        },
                      });
                    } catch (err) {
                      logger.error('[xAI Voice] Function call error', { name: call.name, err });

                      // Track failed function call for assertions
                      functionCallOutputs.push({
                        name: call.name,
                        arguments: parsedArgs,
                        result: JSON.stringify({ error: String(err) }),
                      });

                      sendEvent({
                        type: 'conversation.item.create',
                        item: {
                          type: 'function_call_output',
                          call_id: call.call_id,
                          output: JSON.stringify({ error: String(err) }),
                        },
                      });
                    }
                  } else {
                    // Track function call even without handler for assertions
                    functionCallOutputs.push({
                      name: call.name,
                      arguments: parsedArgs,
                    });
                  }
                }

                pendingFunctionCalls = [];

                // Request continuation if we have a handler
                if (this.config.functionCallHandler) {
                  sendEvent({ type: 'response.create' });
                  return;
                }
              }

              // Calculate cost and resolve
              clearTimeout(timeout);
              const durationMs = Date.now() - connectionStartTime;
              const cost = calculateXAIVoiceCost(durationMs);

              // Prepare audio data
              let finalAudioData: string | null = null;
              const sampleRate =
                this.config.audio?.output?.format?.rate || XAI_VOICE_DEFAULTS.sampleRate;

              if (hasAudioContent && audioChunks.length > 0) {
                try {
                  const rawPcmData = Buffer.concat(audioChunks);
                  const wavData = convertPcm16ToWav(rawPcmData, sampleRate);
                  finalAudioData = wavData.toString('base64');
                  logger.debug('[xAI Voice] Audio converted', {
                    pcmBytes: rawPcmData.length,
                    wavBytes: wavData.length,
                  });
                } catch (error) {
                  logger.error('[xAI Voice] Audio conversion error', { error });
                }
              }

              ws.close();

              // Handle empty transcript
              if (!responseTranscript) {
                responseTranscript = hasAudioContent
                  ? '[Audio response received]'
                  : '[No response received from API]';
              }

              resolve({
                output: responseTranscript,
                cost,
                metadata: {
                  voice: this.config.voice || XAI_VOICE_DEFAULTS.voice,
                  durationMs,
                  model: this.modelName,
                  hasAudio: hasAudioContent,
                  functionCallResults:
                    functionCallResults.length > 0 ? functionCallResults : undefined,
                },
                // Expose function calls for assertions
                functionCalls: functionCallOutputs.length > 0 ? functionCallOutputs : undefined,
                ...(finalAudioData && {
                  audio: {
                    data: finalAudioData,
                    format: 'wav',
                    transcript: responseTranscript,
                  },
                }),
              });
              break;
            }

            // Error handling
            case 'error': {
              const errorMessage =
                (message.error as { message?: string })?.message || 'Unknown error';
              logger.error('[xAI Voice] API error', { error: errorMessage });
              clearTimeout(timeout);
              ws.close();
              reject(new Error(errorMessage));
              break;
            }
          }
        } catch (err) {
          logger.error('[xAI Voice] Message parse error', { err });
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      });

      // Error handler
      ws.on('error', (err) => {
        logger.error('[xAI Voice] WebSocket error', { error: err.message });
        clearTimeout(timeout);
        reject(err);
      });

      // Close handler
      ws.on('close', (code, reason) => {
        logger.debug('[xAI Voice] WebSocket closed', { code, reason: reason.toString() });
        clearTimeout(timeout);

        if (!responseDone) {
          reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
        }
      });
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an xAI Voice provider instance
 */
export function createXAIVoiceProvider(
  providerPath: string,
  options: { config?: XAIVoiceOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  // Parse model name from path: xai:voice:<model>
  const splits = providerPath.split(':');
  const modelName = splits.slice(2).join(':') || 'grok-3';

  return new XAIVoiceProvider(modelName, options);
}
