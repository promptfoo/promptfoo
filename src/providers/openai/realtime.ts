import WebSocket from 'ws';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { OpenAiGenericProvider } from '.';
import { OPENAI_REALTIME_MODELS } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { OpenAiCompletionOptions } from './types';

/**
 * Convert PCM16 audio data to WAV format for browser playback
 * @param pcmData Raw PCM16 audio data buffer
 * @param sampleRate Sample rate (default 24000 for gpt-realtime)
 * @returns WAV format buffer
 */
function convertPcm16ToWav(pcmData: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1; // Mono
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
  offset += 4; // chunk size
  wavHeader.writeUInt16LE(1, offset);
  offset += 2; // audio format (PCM)
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
 * Convert accumulated PCM audio buffers to a WAV base64 string.
 * Returns null if no audio or conversion fails.
 */
function buildAudioData(audioContent: Buffer[]): string | null {
  if (audioContent.length === 0) {
    return null;
  }
  try {
    const rawPcmData = Buffer.concat(audioContent);
    const wavData = convertPcm16ToWav(rawPcmData);
    const result = wavData.toString('base64');
    logger.debug(
      `Audio conversion: PCM16 ${rawPcmData.length} bytes -> WAV ${wavData.length} bytes`,
    );
    return result;
  } catch (error) {
    logger.error(`Error converting audio data to WAV format: ${error}`);
    return null;
  }
}

/**
 * Build a RealtimeResponse object from accumulated state.
 */
function buildRealtimeResponse(opts: {
  responseText: string;
  usage: any;
  responseId: string;
  messageId: string;
  hasAudioContent: boolean;
  audioContent: Buffer[];
  audioFormat: string;
  functionCallOccurred: boolean;
  functionCallResults: string[];
}): RealtimeResponse {
  const {
    responseText,
    usage,
    responseId,
    messageId,
    hasAudioContent,
    audioContent,
    audioFormat,
    functionCallOccurred,
    functionCallResults,
  } = opts;

  let finalAudioData: string | null = null;
  let hadAudio = hasAudioContent;
  if (hasAudioContent && audioContent.length > 0) {
    finalAudioData = buildAudioData(audioContent);
    if (finalAudioData === null) {
      hadAudio = false;
    }
  }

  return {
    output: responseText,
    tokenUsage: {
      total: usage?.total_tokens || 0,
      prompt: usage?.input_tokens || 0,
      completion: usage?.output_tokens || 0,
      cached: 0,
      numRequests: 1,
    },
    cached: false,
    metadata: {
      responseId,
      messageId,
      usage,
      ...(hadAudio && {
        audio: {
          data: finalAudioData,
          format: audioFormat,
          transcript: responseText,
        },
      }),
    },
    functionCallOccurred,
    functionCallResults: functionCallResults.length > 0 ? functionCallResults : undefined,
  };
}

/**
 * Process pending function calls: invoke the handler, send results back, request new response.
 * Returns true if function calls were processed (caller should not resolve yet).
 */
async function processFunctionCalls(
  pendingFunctionCalls: { id: string; name: string; arguments: string }[],
  functionCallHandler: ((name: string, args: string) => Promise<string>) | undefined,
  sendEvent: (event: any) => string,
  functionCallResults: string[],
): Promise<boolean> {
  if (pendingFunctionCalls.length === 0 || !functionCallHandler) {
    return false;
  }

  for (const call of pendingFunctionCalls) {
    try {
      const result = await functionCallHandler(call.name, call.arguments);
      functionCallResults.push(result);
      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call.id,
          output: result,
        },
      });
    } catch (err) {
      logger.error(`Error executing function ${call.name}: ${err}`);
      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call.id,
          output: JSON.stringify({ error: String(err) }),
        },
      });
    }
  }

  sendEvent({ type: 'response.create' });
  return true;
}

/**
 * Ensure responseText is non-empty, using fallbacks from message content.
 */
function ensureNonEmptyResponseText(responseText: string, message: WebSocketMessage): string {
  if (responseText.length > 0) {
    return responseText;
  }

  logger.debug('Empty response detected before resolving. Checking response message details');
  logger.debug('Response message details: ' + JSON.stringify(message, null, 2));

  if (message.response && message.response.content && Array.isArray(message.response.content)) {
    const textContent = message.response.content.find(
      (item: any) => item.type === 'text' && item.text && item.text.length > 0,
    );
    if (textContent) {
      logger.debug(`Found text in response content, using as fallback: "${textContent.text}"`);
      return textContent.text;
    }
    logger.debug('No fallback text content found in response message');
  }

  logger.debug('Using placeholder message for empty response');
  return '[No response received from API]';
}

/**
 * Log close-code-specific diagnostics.
 */
function logWebSocketCloseCode(code: number, reason: Buffer | string): void {
  if (code === 1006) {
    logger.error(
      'WebSocket connection closed abnormally - this often indicates a network or firewall issue',
    );
  } else if (code === 1008) {
    logger.error(
      'WebSocket connection rejected due to policy violation (possibly wrong API key or permissions)',
    );
  } else if (code === 403 || reason.toString().includes('403')) {
    logger.error(
      'WebSocket connection received 403 Forbidden - verify API key permissions and rate limits',
    );
  }
}

/**
 * Attempt to decode base64 audio delta and push to accumulator.
 * Returns true if audio was successfully decoded and added.
 */
function appendAudioDelta(message: WebSocketMessage, audioContent: Buffer[]): boolean {
  const audioData = message.audio || message.delta;
  logger.debug(
    `Received audio data chunk: delta field exists=${!!message.delta}, length=${message.delta ? message.delta.length : 0}`,
  );
  if (!audioData || audioData.length === 0) {
    logger.debug(
      `Audio delta received but no audio data present. Message fields: ${Object.keys(message).join(', ')}`,
    );
    return false;
  }
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');
    audioContent.push(audioBuffer);
    logger.debug(
      `Successfully processed audio chunk: ${audioBuffer.length} bytes, total chunks: ${audioContent.length}`,
    );
    return true;
  } catch (error) {
    logger.error(`Error processing audio data: ${error}`);
    return false;
  }
}

/**
 * Handle a response.output_item.added message.
 * Updates pendingFunctionCalls, functionCallOccurred, and responseText in place via returned values.
 */
function handleOutputItemAdded(
  message: WebSocketMessage,
  pendingFunctionCalls: { id: string; name: string; arguments: string }[],
  responseText: string,
  functionCallOccurred: boolean,
): { responseText: string; functionCallOccurred: boolean } {
  if (message.item.type === 'function_call') {
    pendingFunctionCalls.push({
      id: message.item.call_id,
      name: message.item.name,
      arguments: message.item.arguments || '{}',
    });
    return { responseText, functionCallOccurred: true };
  }
  if (message.item.type === 'text') {
    if (message.item.text) {
      const newText = responseText + message.item.text;
      logger.debug(
        `Added text output item: "${message.item.text}", current length: ${newText.length}`,
      );
      return { responseText: newText, functionCallOccurred };
    }
    logger.debug('Received text output item with empty text');
    return { responseText, functionCallOccurred };
  }
  logger.debug(`Received output item of type: ${message.item.type}`);
  return { responseText, functionCallOccurred };
}

/** Mutable accumulator shared across WebSocket message dispatches for a single request. */
interface WsCallState {
  responseText: string;
  responseError: string;
  responseDone: boolean;
  audioContent: Buffer[];
  audioFormat: string;
  hasAudioContent: boolean;
  messageId: string;
  responseId: string;
  pendingFunctionCalls: { id: string; name: string; arguments: string }[];
  functionCallOccurred: boolean;
  functionCallResults: string[];
}

export interface OpenAiRealtimeOptions extends OpenAiCompletionOptions {
  modalities?: string[];
  instructions?: string;
  input_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription?: {
    model?: string;
    language?: string;
    prompt?: string;
  } | null;
  output_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  turn_detection?: {
    type: 'server_vad';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
    create_response?: boolean;
  } | null;
  voice?:
    | 'alloy'
    | 'ash'
    | 'ballad'
    | 'coral'
    | 'echo'
    | 'sage'
    | 'shimmer'
    | 'verse'
    | 'cedar'
    | 'marin';
  max_response_output_tokens?: number | 'inf';
  websocketTimeout?: number; // Timeout for WebSocket connection in milliseconds
  tools?: any[]; // Array of function definitions
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  functionCallHandler?: (name: string, args: string) => Promise<string>; // Handler for function calls
  apiVersion?: string; // Optional API version
  maintainContext?: boolean;
}

interface WebSocketMessage {
  type: string;
  event_id?: string;
  [key: string]: any;
}

interface RealtimeResponse {
  output: string;
  tokenUsage: TokenUsage;
  cached: boolean;
  metadata: any;
  functionCallOccurred?: boolean;
  functionCallResults?: string[];
}

export class OpenAiRealtimeProvider extends OpenAiGenericProvider {
  static OPENAI_REALTIME_MODELS = OPENAI_REALTIME_MODELS;

  static OPENAI_REALTIME_MODEL_NAMES = OPENAI_REALTIME_MODELS.map((model) => model.id);

  config: OpenAiRealtimeOptions;

  // Add persistent connection handling
  persistentConnection: WebSocket | null = null;
  previousItemId: string | null = null;
  assistantMessageIds: string[] = []; // Track assistant message IDs
  private activeTimeouts: Set<NodeJS.Timeout> = new Set();

  // Add audio state management
  private lastAudioItemId: string | null = null;
  private currentAudioBuffer: Buffer[] = [];
  private currentAudioFormat: string = 'wav';
  private isProcessingAudio: boolean = false;
  private audioTimeout: NodeJS.Timeout | null = null;

  constructor(
    modelName: string,
    options: { config?: OpenAiRealtimeOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiRealtimeProvider.OPENAI_REALTIME_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown OpenAI realtime model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};

    // Enable maintainContext by default
    if (this.config.maintainContext === undefined) {
      this.config.maintainContext = true;
    }
  }

  // Build base WebSocket URL from configured API base URL
  private getWebSocketBase(): string {
    const base = this.getApiUrl();
    // Convert scheme and strip trailing slashes
    const wsBase = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    return wsBase.replace(/\/+$/, '');
  }

  // Build WebSocket URL for realtime model endpoint
  private getWebSocketUrl(modelName: string): string {
    const wsBase = this.getWebSocketBase();
    return `${wsBase}/realtime?model=${encodeURIComponent(modelName)}`;
  }

  // Build WebSocket URL for client-secret based socket initialization
  private getClientSecretSocketUrl(clientSecret: string): string {
    const wsBase = this.getWebSocketBase();
    return `${wsBase}/realtime/socket?client_secret=${encodeURIComponent(clientSecret)}`;
  }

  // Compute Origin header from apiBaseUrl (match scheme and host)
  private getWebSocketOrigin(): string {
    const u = new URL(this.getApiUrl());
    const scheme = u.protocol === 'http:' ? 'http:' : 'https:';
    return `${scheme}//${u.host}`;
  }

  // Add method to reset audio state
  private resetAudioState(): void {
    this.lastAudioItemId = null;
    this.currentAudioBuffer = [];
    this.currentAudioFormat = 'wav';
    this.isProcessingAudio = false;
    if (this.audioTimeout) {
      clearTimeout(this.audioTimeout);
      this.audioTimeout = null;
    }
  }

  async getRealtimeSessionBody() {
    // Default values
    const modalities = this.config.modalities || ['text', 'audio'];
    const voice = this.config.voice || 'alloy';
    const instructions = this.config.instructions || 'You are a helpful assistant.';
    const inputAudioFormat = this.config.input_audio_format || 'pcm16';
    const outputAudioFormat = this.config.output_audio_format || 'pcm16';
    const temperature = this.config.temperature ?? 0.8;
    const maxResponseOutputTokens = this.config.max_response_output_tokens || 'inf';

    const body: any = {
      model: this.modelName,
      modalities,
      instructions,
      voice,
      input_audio_format: inputAudioFormat,
      output_audio_format: outputAudioFormat,
      temperature,
      max_response_output_tokens: maxResponseOutputTokens,
    };

    // Add optional configurations
    if (this.config.input_audio_transcription !== undefined) {
      body.input_audio_transcription = this.config.input_audio_transcription;
    }

    if (this.config.turn_detection !== undefined) {
      body.turn_detection = this.config.turn_detection;
    }

    if (this.config.tools && this.config.tools.length > 0) {
      const loadedTools = await maybeLoadToolsFromExternalFile(this.config.tools);
      if (loadedTools !== undefined) {
        body.tools = loadedTools;
      }
      // If tools are provided but no tool_choice, default to auto
      if (this.config.tool_choice === undefined) {
        body.tool_choice = 'auto';
      }
    }

    if (this.config.tool_choice) {
      body.tool_choice = this.config.tool_choice;
    }

    return body;
  }

  generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Dispatch a single WebSocket message for stateful (non-persistent) connections.
   *
   * Returns a resolved RealtimeResponse when the exchange is complete,
   * 'error' when an error message was received (caller should reject),
   * or null to continue waiting.
   */
  private async dispatchWsMessage(
    message: WebSocketMessage,
    state: WsCallState,
    ws: WebSocket,
    timeout: NodeJS.Timeout,
    sendEvent: (event: any) => string,
    onSessionReady: () => void,
  ): Promise<RealtimeResponse | 'error' | null> {
    switch (message.type) {
      case 'session.ready':
        logger.debug('Session ready on WebSocket');
        onSessionReady();
        break;
      case 'session.created':
        logger.debug('Session created on WebSocket');
        break;
      case 'session.updated':
        logger.debug('Session updated on WebSocket');
        break;
      case 'conversation.item.created':
        if (message.item.role === 'user') {
          state.messageId = message.item.id;
          sendEvent(await this.buildResponseCreateEvent());
        }
        break;
      case 'response.created':
        state.responseId = message.response.id;
        break;
      case 'response.text.delta':
        state.responseText += message.delta;
        logger.debug(
          `Added text delta: "${message.delta}", current length: ${state.responseText.length}`,
        );
        break;
      case 'response.text.done':
        if (message.text && message.text.length > 0) {
          logger.debug(
            `Setting final text content from response.text.done: "${message.text}" (length: ${message.text.length})`,
          );
          state.responseText = message.text;
        } else {
          logger.debug('Received empty text in response.text.done');
        }
        break;
      case 'response.content_part.added':
        logger.debug(`Received content part: ${JSON.stringify(message.content_part)}`);
        if (message.content_part?.id) {
          logger.debug(`Content part added with ID: ${message.content_part.id}`);
        }
        break;
      case 'response.content_part.done':
        logger.debug('Content part completed');
        break;
      case 'response.audio_transcript.delta':
        state.responseText += message.delta;
        logger.debug(
          `Added audio transcript delta: "${message.delta}", current length: ${state.responseText.length}`,
        );
        break;
      case 'response.audio_transcript.done':
        if (message.text && message.text.length > 0) {
          logger.debug(
            `Setting final audio transcript text: "${message.text}" (length: ${message.text.length})`,
          );
          state.responseText = message.text;
        } else {
          logger.debug('Received empty text in response.audio_transcript.done');
        }
        break;
      case 'response.audio.delta':
        if (appendAudioDelta(message, state.audioContent)) {
          state.hasAudioContent = true;
        }
        break;
      case 'response.audio.done':
        logger.debug('Audio data complete');
        if (message.format) {
          state.audioFormat = message.format;
        }
        break;
      case 'response.output_item.added': {
        const next = handleOutputItemAdded(
          message,
          state.pendingFunctionCalls,
          state.responseText,
          state.functionCallOccurred,
        );
        state.responseText = next.responseText;
        state.functionCallOccurred = next.functionCallOccurred;
        break;
      }
      case 'response.output_item.done':
        logger.debug('Output item complete');
        break;
      case 'response.function_call_arguments.done': {
        const idx = state.pendingFunctionCalls.findIndex((c) => c.id === message.call_id);
        if (idx !== -1) {
          state.pendingFunctionCalls[idx].arguments = message.arguments;
        }
        break;
      }
      case 'response.done': {
        state.responseDone = true;
        return this.handleResponseDone({
          message,
          responseText: state.responseText,
          pendingFunctionCalls: state.pendingFunctionCalls,
          functionCallOccurred: state.functionCallOccurred,
          functionCallResults: state.functionCallResults,
          hasAudioContent: state.hasAudioContent,
          audioContent: state.audioContent,
          audioFormat: state.audioFormat,
          responseId: state.responseId,
          messageId: state.messageId,
          sendEvent,
          ws,
          timeout,
        });
      }
      case 'rate_limits.updated':
        logger.debug(`Rate limits updated: ${JSON.stringify(message.rate_limits)}`);
        break;
      case 'error':
        state.responseError = `Error: ${message.error.message}`;
        logger.error(`WebSocket error: ${state.responseError} (${message.error.type})`);
        return 'error';
    }
    return null;
  }

  /**
   * Build a response.create event body (shared between webSocketRequest and directWebSocketRequest).
   */
  private async buildResponseCreateEvent(): Promise<any> {
    const responseEvent: any = {
      type: 'response.create',
      response: {
        modalities: this.config.modalities || ['text', 'audio'],
        instructions: this.config.instructions || 'You are a helpful assistant.',
        voice: this.config.voice || 'alloy',
        temperature: this.config.temperature ?? 0.8,
      },
    };

    if (this.config.tools && this.config.tools.length > 0) {
      const loadedTools = await maybeLoadToolsFromExternalFile(this.config.tools);
      if (loadedTools !== undefined) {
        responseEvent.response.tools = loadedTools;
      }
      if (Object.prototype.hasOwnProperty.call(this.config, 'tool_choice')) {
        responseEvent.response.tool_choice = this.config.tool_choice;
      } else {
        responseEvent.response.tool_choice = 'auto';
      }
    }

    return responseEvent;
  }

  /**
   * Handle the 'response.done' event for webSocketRequest / directWebSocketRequest.
   * Returns the resolved response, or null if function calls were dispatched
   * (meaning the caller should wait for another response.done).
   */
  private async handleResponseDone(opts: {
    message: WebSocketMessage;
    responseText: string;
    pendingFunctionCalls: { id: string; name: string; arguments: string }[];
    functionCallOccurred: boolean;
    functionCallResults: string[];
    hasAudioContent: boolean;
    audioContent: Buffer[];
    audioFormat: string;
    responseId: string;
    messageId: string;
    sendEvent: (event: any) => string;
    ws: WebSocket;
    timeout: NodeJS.Timeout;
  }): Promise<RealtimeResponse | null> {
    const {
      message,
      pendingFunctionCalls,
      functionCallOccurred,
      functionCallResults,
      sendEvent,
      ws,
      timeout,
    } = opts;

    let { responseText, hasAudioContent, audioContent, audioFormat, responseId, messageId } = opts;

    const usage = message.response?.usage ?? null;

    // Handle pending function calls first
    const didProcess = await processFunctionCalls(
      pendingFunctionCalls,
      this.config.functionCallHandler,
      sendEvent,
      functionCallResults,
    );
    if (didProcess) {
      // Clear handled calls; wait for next response.done
      pendingFunctionCalls.length = 0;
      return null;
    }

    clearTimeout(timeout);

    responseText = ensureNonEmptyResponseText(responseText, message);

    ws.close();

    // Check if audio was generated based on usage tokens (for gpt-realtime)
    if (usage?.output_token_details?.audio_tokens && usage.output_token_details.audio_tokens > 0) {
      if (!hasAudioContent) {
        hasAudioContent = true;
      }
      audioFormat = 'wav';
      logger.debug(
        `Audio detected from usage tokens: ${usage.output_token_details.audio_tokens} audio tokens, converting PCM16 to WAV format`,
      );
    }

    logger.debug(
      `AUDIO TRACE: Before resolve - hasAudioContent=${hasAudioContent}, audioContent.length=${audioContent.length}, finalAudioData.length=${buildAudioData(audioContent)?.length || 0}`,
    );
    logger.debug(
      `AUDIO TRACE: audioFormat=${audioFormat}, responseText.length=${responseText.length}`,
    );

    return buildRealtimeResponse({
      responseText,
      usage,
      responseId,
      messageId,
      hasAudioContent,
      audioContent,
      audioFormat,
      functionCallOccurred,
      functionCallResults,
    });
  }

  async webSocketRequest(clientSecret: string, prompt: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      logger.debug(
        `Attempting to connect to OpenAI WebSocket with client secret: ${clientSecret.slice(0, 5)}...`,
      );

      const wsUrl = this.getClientSecretSocketUrl(clientSecret);
      logger.debug(`Connecting to WebSocket URL: ${wsUrl.slice(0, 60)}...`);

      const wsOptions = {
        headers: {
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: this.getWebSocketOrigin(),
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, this.config.websocketTimeout || 30000);

      const state: WsCallState = {
        responseText: '',
        responseError: '',
        responseDone: false,
        audioContent: [],
        audioFormat: 'wav',
        hasAudioContent: false,
        messageId: '',
        responseId: '',
        pendingFunctionCalls: [],
        functionCallOccurred: false,
        functionCallResults: [],
      };

      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      const sendUserMessage = () => {
        sendEvent({
          type: 'conversation.item.create',
          previous_item_id: null,
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: prompt }],
          },
        });
      };

      ws.on('open', async () => {
        logger.debug('WebSocket connection established successfully');
        sendUserMessage();
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.debug(`Received WebSocket message: ${message.type}`);
          const debugMessage = { ...message };
          if (debugMessage.audio) {
            debugMessage.audio = '[AUDIO_DATA]';
          }
          logger.debug(`Message data: ${JSON.stringify(debugMessage, null, 2)}`);

          const result = await this.dispatchWsMessage(
            message,
            state,
            ws,
            timeout,
            sendEvent,
            sendUserMessage,
          );

          if (result === 'error') {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(state.responseError));
          } else if (result !== null) {
            resolve(result);
          }
        } catch (err) {
          logger.error(`Error parsing WebSocket message: ${err}`);
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket error: ${err.message}`);
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', (code, reason) => {
        logger.debug(`WebSocket closed with code ${code}: ${reason}`);
        clearTimeout(timeout);
        logWebSocketCloseCode(code, reason);
        const connectionClosedPrematurely = !state.responseDone && state.responseError.length === 0;
        if (connectionClosedPrematurely) {
          reject(
            new Error(
              `WebSocket closed unexpectedly with code ${code}: ${reason}. This may indicate a networking issue, firewall restriction, or API access limitation.`,
            ),
          );
        }
      });
    });
  }

  /**
   * Extract the last user message text from a potentially JSON-encoded prompt.
   */
  private extractPromptText(prompt: string): string {
    try {
      const parsedPrompt = JSON.parse(prompt);

      if (Array.isArray(parsedPrompt) && parsedPrompt.length > 0) {
        for (let i = parsedPrompt.length - 1; i >= 0; i--) {
          const message = parsedPrompt[i];
          if (message.role !== 'user') {
            continue;
          }
          if (typeof message.content === 'string') {
            return message.content;
          }
          if (Array.isArray(message.content) && message.content.length > 0) {
            const textContent = message.content.find(
              (content: any) =>
                (content.type === 'text' || content.type === 'input_text') &&
                typeof content.text === 'string',
            );
            if (textContent) {
              return textContent.text;
            }
          }
        }
      } else if (parsedPrompt && typeof parsedPrompt === 'object' && parsedPrompt.prompt) {
        return parsedPrompt.prompt;
      }
    } catch {
      logger.debug('Using prompt as is - not a JSON structure');
    }
    return prompt;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // Apply function handler if provided in context
    if (
      context?.prompt?.config?.functionCallHandler &&
      typeof context.prompt.config.functionCallHandler === 'function'
    ) {
      this.config.functionCallHandler = context.prompt.config.functionCallHandler;
    }

    // If no conversationId is provided in the metadata, set maintainContext to false
    const conversationId =
      context?.test && 'metadata' in context.test
        ? (context.test.metadata as Record<string, any>)?.conversationId
        : undefined;

    if (!conversationId) {
      this.config.maintainContext = false;
    }

    try {
      const promptText = this.extractPromptText(prompt);

      let result: RealtimeResponse;
      if (this.config.maintainContext === true) {
        result = await this.persistentWebSocketRequest(promptText);
      } else {
        logger.debug(`Connecting directly to OpenAI Realtime API WebSocket with API key`);
        result = await this.directWebSocketRequest(promptText);
      }

      let finalOutput = result.output;

      logger.debug(`Final output from API: "${finalOutput}" (length: ${finalOutput.length})`);

      if (finalOutput.length === 0) {
        logger.debug(
          'Received empty response from Realtime API - possible issue with transcript accumulation. Check modalities configuration.',
        );
        finalOutput = '[No response received from API]';
      }

      if (
        result.functionCallOccurred &&
        result.functionCallResults &&
        result.functionCallResults.length > 0
      ) {
        finalOutput += '\n\n[Function calls were made during processing]';
      }

      const metadata = {
        ...result.metadata,
        functionCallOccurred: result.functionCallOccurred,
        functionCallResults: result.functionCallResults,
      };

      if (result.metadata?.audio) {
        const audioDataBase64 = result.metadata.audio.data;
        metadata.audio = {
          data: audioDataBase64,
          format: result.metadata.audio.format,
          transcript: result.output,
        };
        logger.debug(
          `AUDIO TRACE: Main callApi - Found result.metadata.audio, data.length=${audioDataBase64?.length || 0}, format=${result.metadata.audio.format}`,
        );
      } else {
        logger.debug(
          `AUDIO TRACE: Main callApi - No result.metadata.audio found. result.metadata keys: ${Object.keys(result.metadata || {}).join(', ')}`,
        );
      }

      return {
        output: finalOutput,
        tokenUsage: result.tokenUsage,
        cached: result.cached,
        metadata,
        ...(metadata.audio && {
          audio: {
            data: metadata.audio.data,
            format: metadata.audio.format,
            transcript: metadata.audio.transcript || result.output,
          },
        }),
      };
    } catch (err) {
      const errorMessage = `WebSocket error: ${String(err)}`;
      logger.error(errorMessage);
      if (errorMessage.includes('403')) {
        logger.error(`
        This 403 error usually means one of the following:
        1. WebSocket connections are blocked by your network/firewall
        2. Your OpenAI API key doesn't have access to the Realtime API
        3. There are rate limits or quotas in place for your account
        Try:
        - Using a different network connection
        - Checking your OpenAI API key permissions
        - Verifying you have access to the Realtime API beta`);
      }
      return {
        error: errorMessage,
        metadata: {},
      };
    }
  }

  async directWebSocketRequest(prompt: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      logger.debug(`Establishing direct WebSocket connection to OpenAI Realtime API`);

      const wsUrl = this.getWebSocketUrl(this.modelName);
      logger.debug(`Connecting to WebSocket URL: ${wsUrl}`);

      const wsOptions = {
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'OpenAI-Beta': 'realtime=v1',
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: this.getWebSocketOrigin(),
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, this.config.websocketTimeout || 30000);

      const state: WsCallState = {
        responseText: '',
        responseError: '',
        responseDone: false,
        audioContent: [],
        audioFormat: 'wav',
        hasAudioContent: false,
        messageId: '',
        responseId: '',
        pendingFunctionCalls: [],
        functionCallOccurred: false,
        functionCallResults: [],
      };

      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      const sendUserMessage = () => {
        sendEvent({
          type: 'conversation.item.create',
          previous_item_id: null,
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: prompt }],
          },
        });
      };

      ws.on('open', async () => {
        logger.debug('WebSocket connection established successfully');

        sendEvent({
          type: 'session.update',
          session: {
            modalities: this.config.modalities || ['text', 'audio'],
            instructions: this.config.instructions || 'You are a helpful assistant.',
            voice: this.config.voice || 'alloy',
            input_audio_format: this.config.input_audio_format || 'pcm16',
            output_audio_format: this.config.output_audio_format || 'pcm16',
            temperature: this.config.temperature ?? 0.8,
            max_response_output_tokens: this.config.max_response_output_tokens || 'inf',
            ...(this.config.input_audio_transcription !== undefined && {
              input_audio_transcription: this.config.input_audio_transcription,
            }),
            ...(this.config.turn_detection !== undefined && {
              turn_detection: this.config.turn_detection,
            }),
            ...(this.config.tools &&
              this.config.tools.length > 0 && {
                tools: await maybeLoadToolsFromExternalFile(this.config.tools),
                tool_choice: this.config.tool_choice || 'auto',
              }),
          },
        });

        sendUserMessage();
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.debug(`Received WebSocket message: ${message.type}`);
          const debugMessage = { ...message };
          if (debugMessage.audio) {
            debugMessage.audio = '[AUDIO_DATA]';
          }
          logger.debug(`Message data: ${JSON.stringify(debugMessage, null, 2)}`);

          const result = await this.dispatchWsMessage(
            message,
            state,
            ws,
            timeout,
            sendEvent,
            sendUserMessage,
          );

          if (result === 'error') {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(state.responseError));
          } else if (result !== null) {
            resolve(result);
          }
        } catch (err) {
          logger.error(`Error parsing WebSocket message: ${err}`);
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket error: ${err.message}`);
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', (code, reason) => {
        logger.debug(`WebSocket closed with code ${code}: ${reason}`);
        clearTimeout(timeout);
        logWebSocketCloseCode(code, reason);
        const connectionClosedPrematurely = !state.responseDone && state.responseError.length === 0;
        if (connectionClosedPrematurely) {
          reject(
            new Error(
              `WebSocket closed unexpectedly with code ${code}: ${reason}. This may indicate a networking issue, firewall restriction, or API access limitation.`,
            ),
          );
        }
      });
    });
  }

  // New method for persistent connection
  async persistentWebSocketRequest(prompt: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      logger.debug(`Using persistent WebSocket connection to OpenAI Realtime API`);

      const connection = this.persistentConnection;

      if (connection) {
        this.setupMessageHandlers(prompt, resolve, reject);
      } else {
        const wsUrl = this.getWebSocketUrl(this.modelName);
        logger.debug(`Connecting to WebSocket URL: ${wsUrl}`);

        const wsOptions = {
          headers: {
            Authorization: `Bearer ${this.getApiKey()}`,
            'OpenAI-Beta': 'realtime=v1',
            'User-Agent': 'promptfoo Realtime API Client',
            Origin: this.getWebSocketOrigin(),
          },
          handshakeTimeout: 10000,
          perMessageDeflate: false,
        };

        this.persistentConnection = new WebSocket(wsUrl, wsOptions);

        this.persistentConnection.once('open', () => {
          logger.debug('Persistent WebSocket connection established successfully');
          this.setupMessageHandlers(prompt, resolve, reject);
        });

        this.persistentConnection.once('error', (err: Error) => {
          logger.error(`WebSocket connection error: ${err}`);
          reject(err);
        });
      }
    });
  }

  // Helper method to set up message handlers for persistent WebSocket
  private setupMessageHandlers(
    prompt: string,
    resolve: (value: RealtimeResponse) => void,
    reject: (reason: Error) => void,
  ): void {
    // Reset audio state at the start of each request
    this.resetAudioState();

    const requestTimeout = setTimeout(() => {
      logger.error('WebSocket response timed out');
      this.resetAudioState();
      reject(new Error('WebSocket response timed out'));
    }, this.config.websocketTimeout || 30000);

    let responseText = '';
    let textDone = false;
    let audioDone = true;
    let _usage: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    } | null = null;

    let _messageId = '';
    let _responseId = '';
    const functionCallOccurred = false;
    const functionCallResults: string[] = [];

    const sendEvent = (event: any) => {
      if (!event.event_id) {
        event.event_id = this.generateEventId();
      }
      const connection = this.persistentConnection;
      if (connection) {
        connection.send(JSON.stringify(event));
      }
      return event.event_id;
    };

    let cleanupMessageHandler: (() => void) | null = null;

    const resolveResponse = () => {
      if (cleanupMessageHandler) {
        cleanupMessageHandler();
      }

      clearTimeout(requestTimeout);

      if (responseText.length === 0) {
        logger.warn('Empty response text detected');
        if (this.currentAudioBuffer.length > 0) {
          responseText = '[Audio response received]';
        } else {
          responseText = '[No response received from API]';
        }
      }

      const finalAudioData =
        this.currentAudioBuffer.length > 0
          ? Buffer.concat(this.currentAudioBuffer).toString('base64')
          : null;

      const hadAudio = this.currentAudioBuffer.length > 0;
      const finalAudioFormat = this.currentAudioFormat;

      this.resetAudioState();

      resolve({
        output: responseText,
        tokenUsage: {
          total: _usage?.total_tokens || 0,
          prompt: _usage?.prompt_tokens || 0,
          completion: _usage?.completion_tokens || 0,
          cached: 0,
          numRequests: 1,
        },
        cached: false,
        metadata: {
          responseId: _responseId,
          messageId: _messageId,
          usage: _usage,
          ...(hadAudio && {
            audio: {
              data: finalAudioData,
              format: finalAudioFormat,
            },
          }),
        },
        ...(hadAudio && {
          audio: {
            data: finalAudioData,
            format: finalAudioFormat,
            transcript: responseText,
          },
        }),
        functionCallOccurred,
        functionCallResults,
      });
    };

    const checkAndResolve = () => {
      if (textDone && audioDone) {
        resolveResponse();
      } else {
        logger.info(`Waiting for completion - Text done: ${textDone}, Audio done: ${audioDone}`);
      }
    };

    const messageHandler = this.buildPersistentMessageHandler({
      sendEvent,
      requestTimeout,
      checkAndResolve,
      reject,
      getResponseText: () => responseText,
      setResponseText: (t) => {
        responseText = t;
      },
      setResponseId: (id) => {
        _responseId = id;
      },
      setMessageId: (id) => {
        _messageId = id;
      },
      setUsage: (u) => {
        _usage = u;
      },
      setTextDone: (v) => {
        textDone = v;
      },
      setAudioDone: (v) => {
        audioDone = v;
      },
    });

    if (this.persistentConnection) {
      this.persistentConnection.on('message', messageHandler);
      this.persistentConnection.once('error', (error: Error) => {
        logger.error(`WebSocket error: ${error}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        this.persistentConnection = null;
        reject(error);
      });

      cleanupMessageHandler = () => {
        if (this.persistentConnection) {
          this.persistentConnection.removeListener('message', messageHandler);
        }
      };
    }

    sendEvent({
      type: 'conversation.item.create',
      previous_item_id: this.previousItemId,
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    });
  }

  /**
   * Build the async message handler callback for persistent WebSocket connections.
   * Extracted to reduce complexity of setupMessageHandlers.
   */
  private buildPersistentMessageHandler(opts: {
    sendEvent: (event: any) => string;
    requestTimeout: NodeJS.Timeout;
    checkAndResolve: () => void;
    reject: (reason: Error) => void;
    getResponseText: () => string;
    setResponseText: (text: string) => void;
    setResponseId: (id: string) => void;
    setMessageId: (id: string) => void;
    setUsage: (usage: any) => void;
    setTextDone: (done: boolean) => void;
    setAudioDone: (done: boolean) => void;
  }): (data: Buffer) => Promise<void> {
    const {
      sendEvent,
      requestTimeout,
      checkAndResolve,
      reject,
      getResponseText,
      setResponseText,
      setResponseId,
      setMessageId,
      setUsage,
      setTextDone,
      setAudioDone,
    } = opts;

    return async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.dispatchPersistentMessage(
          message,
          sendEvent,
          requestTimeout,
          checkAndResolve,
          reject,
          getResponseText,
          setResponseText,
          setResponseId,
          setMessageId,
          setUsage,
          setTextDone,
          setAudioDone,
        );
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        reject(new Error(`Error processing WebSocket message: ${error}`));
      }
    };
  }

  /**
   * Handle a single message for a persistent WebSocket connection.
   */
  private dispatchPersistentMessage(
    message: WebSocketMessage,
    sendEvent: (event: any) => string,
    requestTimeout: NodeJS.Timeout,
    checkAndResolve: () => void,
    reject: (reason: Error) => void,
    getResponseText: () => string,
    setResponseText: (text: string) => void,
    setResponseId: (id: string) => void,
    setMessageId: (id: string) => void,
    setUsage: (usage: any) => void,
    setTextDone: (done: boolean) => void,
    setAudioDone: (done: boolean) => void,
  ): void {
    switch (message.type) {
      case 'conversation.item.created':
        if (message.item.role === 'user') {
          setMessageId(message.item.id);
          this.previousItemId = message.item.id;
          sendEvent({
            type: 'response.create',
            response: {
              modalities: this.config.modalities || ['text', 'audio'],
              instructions: this.config.instructions || 'You are a helpful assistant.',
              voice: this.config.voice || 'alloy',
              temperature: this.config.temperature ?? 0.8,
            },
          });
        } else if (message.item.role === 'assistant') {
          this.assistantMessageIds.push(message.item.id);
          this.previousItemId = message.item.id;
        }
        break;

      case 'response.created':
        setResponseId(message.response.id);
        break;

      case 'response.text.delta':
      case 'response.audio_transcript.delta':
        setResponseText(getResponseText() + message.delta);
        clearTimeout(requestTimeout);
        break;

      case 'response.text.done':
      case 'response.audio_transcript.done':
        setTextDone(true);
        if (message.text && message.text.length > 0) {
          setResponseText(message.text);
        }
        checkAndResolve();
        break;

      case 'response.audio.delta':
        if (!this.isProcessingAudio) {
          this.isProcessingAudio = true;
          setAudioDone(false);
          clearTimeout(requestTimeout);
        }
        if (message.item_id !== this.lastAudioItemId) {
          this.lastAudioItemId = message.item_id;
          this.currentAudioBuffer = [];
        }
        if (message.audio && message.audio.length > 0) {
          try {
            const audioBuffer = Buffer.from(message.audio, 'base64');
            this.currentAudioBuffer.push(audioBuffer);
          } catch (error) {
            logger.error(`Error processing audio data: ${error}`);
          }
        }
        break;

      case 'response.audio.done':
        if (message.format) {
          this.currentAudioFormat = message.format;
        }
        this.isProcessingAudio = false;
        setAudioDone(true);
        checkAndResolve();
        break;

      case 'response.done':
        if (message.usage) {
          setUsage(message.usage);
        }
        if (!this.isProcessingAudio) {
          setAudioDone(true);
          setTextDone(true);
        }
        checkAndResolve();
        break;

      case 'error': {
        const responseError = message.message || 'Unknown WebSocket error';
        logger.error(`WebSocket error: ${responseError}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        reject(new Error(responseError));
        break;
      }
    }
  }

  // Add cleanup method to close WebSocket connections
  cleanup(): void {
    if (this.persistentConnection) {
      logger.info('Cleaning up persistent WebSocket connection');
      this.activeTimeouts.forEach((t) => clearTimeout(t));
      this.activeTimeouts.clear();
      this.resetAudioState();
      this.persistentConnection.close();
      this.persistentConnection = null;
      this.previousItemId = null;
      this.assistantMessageIds = [];
    }
  }
}
