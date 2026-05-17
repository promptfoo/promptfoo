import WebSocket from 'ws';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import { NON_CONVERSATIONAL_REALTIME_MODELS, OPENAI_REALTIME_MODELS } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { OpenAiCompletionOptions } from './types';

const MAX_RESPONSE_OUTPUT_TOKENS_MAX = 4096;

const DEFAULT_TOOL_CALL_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOOL_ITERATIONS = 8;
// Generic, redacted error string sent back to the model when functionCallHandler
// throws. We do NOT use String(err) — Node Error objects often contain absolute
// paths, connection strings, and stack snippets that would otherwise be fed back
// into the model context and surfaced in eval output.
const REDACTED_TOOL_ERROR_OUTPUT = JSON.stringify({ error: 'Tool execution failed' });

// Build a "(code=N, reason=R)" suffix for WebSocket close-event messages so the
// log line and the rejection Error agree on wording without duplicating the
// template at every call site.
function formatCloseMessage(prefix: string, code: number, reason: Buffer | undefined): string {
  const reasonText = reason?.toString() ?? '';
  return `${prefix} (code=${code}${reasonText ? `, reason=${reasonText}` : ''})`;
}

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

export interface OpenAiRealtimeOptions extends OpenAiCompletionOptions {
  modalities?: string[];
  instructions?: string;
  input_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription?: {
    model?: string;
    language?: string;
    prompt?: string;
    delay?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  } | null;
  output_audio_format?: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  turn_detection?:
    | {
        type: 'server_vad';
        threshold?: number;
        prefix_padding_ms?: number;
        silence_duration_ms?: number;
        create_response?: boolean;
        interrupt_response?: boolean;
        idle_timeout_ms?: number;
      }
    | {
        type: 'semantic_vad';
        eagerness?: 'low' | 'medium' | 'high' | 'auto';
        create_response?: boolean;
        interrupt_response?: boolean;
      }
    | null;
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
  parallel_tool_calls?: boolean;
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
  websocketTimeout?: number; // Timeout for WebSocket connection in milliseconds
  tools?: any[]; // Array of function definitions
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function?: { name: string } }
    | { type: 'function'; name: string };
  functionCallHandler?: (name: string, args: string) => Promise<string>; // Handler for function calls
  toolCallTimeout?: number; // Per-call timeout for functionCallHandler in ms (default 30000)
  maxToolIterations?: number; // Max tool→follow-up rounds in a single turn (default 8)
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
  // Names of function_calls the model emitted but for which no
  // functionCallHandler was configured. Surfaced in the empty-response error
  // metadata so users can debug *which* tool the model tried to call.
  attemptedFunctionCalls?: { name: string }[];
}

// Partial state attached to a rejection so callApi() can preserve it in the
// returned ProviderResponse error metadata. Without this, hitting the iteration
// cap mid-chain throws away the redacted tool outputs already exchanged.
interface RealtimeErrorPartial {
  functionCallOccurred?: boolean;
  functionCallResults?: string[];
}
type RealtimeErrorWithPartial = Error & { partial?: RealtimeErrorPartial };

type RealtimeUserContent =
  | {
      type: 'input_text';
      text: string;
    }
  | {
      type: 'input_audio';
      audio: string;
    }
  | {
      type: 'input_image';
      image_url: string;
    };

export class OpenAiRealtimeProvider extends OpenAiGenericProvider {
  static OPENAI_REALTIME_MODELS = OPENAI_REALTIME_MODELS;

  static OPENAI_REALTIME_MODEL_NAMES = OPENAI_REALTIME_MODELS.map((model) => model.id);

  config: OpenAiRealtimeOptions;

  // Add persistent connection handling
  persistentConnection: WebSocket | null = null;
  previousItemId: string | null = null;
  assistantMessageIds: string[] = []; // Track assistant message IDs
  private activeTimeouts: Set<NodeJS.Timeout> = new Set();

  // Resolves when persistentConnection reaches readyState OPEN. Concurrent
  // callers wait on this promise rather than racing each other to send on a
  // socket whose state is still CONNECTING.
  private connectionReady: Promise<void> | null = null;
  private persistentConnectionLifecycleCleanup: (() => void) | null = null;
  // Per-provider serialization queue. Concurrent calls on the same provider
  // instance share one socket; the OpenAI Realtime wire shape is not designed
  // to multiplex unrelated turns over a single connection (events for one
  // turn would interleave with another's). Chain turns through this promise.
  private inflightTurn: Promise<unknown> = Promise.resolve();

  // Add audio state management
  private lastAudioItemId: string | null = null;
  private currentAudioBuffer: Buffer[] = [];
  private currentAudioFormat: string = 'wav';
  private isProcessingAudio: boolean = false;
  private audioTimeout: NodeJS.Timeout | null = null;

  private hasConfiguredTools(): boolean {
    return Array.isArray(this.config.tools)
      ? this.config.tools.length > 0
      : Boolean(this.config.tools);
  }

  private normalizeRealtimeTools(tools: unknown): unknown {
    if (!Array.isArray(tools)) {
      return tools;
    }

    return tools.map((tool) => {
      if (
        tool &&
        typeof tool === 'object' &&
        (tool as Record<string, unknown>).type === 'function' &&
        typeof (tool as Record<string, unknown>).function === 'object' &&
        (tool as Record<string, unknown>).function !== null
      ) {
        const { function: functionDefinition, ...rest } = tool as Record<string, any>;
        return {
          ...rest,
          ...functionDefinition,
        };
      }

      return tool;
    });
  }

  private normalizeRealtimeToolChoice(): unknown {
    const toolChoice = this.config.tool_choice;

    if (
      toolChoice &&
      typeof toolChoice === 'object' &&
      toolChoice.type === 'function' &&
      'function' in toolChoice &&
      toolChoice.function?.name
    ) {
      return {
        type: 'function',
        name: toolChoice.function.name,
      };
    }

    return toolChoice;
  }

  private async getRealtimeToolConfig(): Promise<Record<string, unknown>> {
    if (!this.hasConfiguredTools()) {
      return {};
    }

    const loadedTools = await maybeLoadToolsFromExternalFile(this.config.tools);
    const normalizedTools = this.normalizeRealtimeTools(loadedTools);

    const toolChoice = this.normalizeRealtimeToolChoice() ?? 'auto';

    return {
      ...(normalizedTools === undefined ? {} : { tools: normalizedTools }),
      tool_choice: toolChoice,
    };
  }

  private async getRealtimeToolConfigWithTimeout(): Promise<Record<string, unknown>> {
    if (!this.hasConfiguredTools()) {
      return {};
    }

    const timeoutMs = this.config.websocketTimeout || 30000;
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        this.getRealtimeToolConfig(),
        new Promise<Record<string, unknown>>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`Realtime tool configuration timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private getRealtimeOutputModalities(): Array<'text' | 'audio'> {
    const modalities = this.config.modalities || ['text', 'audio'];
    return modalities.includes('audio') ? ['audio'] : ['text'];
  }

  private getRealtimeAudioFormat(format: 'pcm16' | 'g711_ulaw' | 'g711_alaw') {
    switch (format) {
      case 'g711_ulaw':
        return { type: 'audio/pcmu' as const };
      case 'g711_alaw':
        return { type: 'audio/pcma' as const };
      case 'pcm16':
      default:
        return { type: 'audio/pcm' as const, rate: 24000 as const };
    }
  }

  private getRealtimeAudioConfig() {
    return {
      input: {
        format: this.getRealtimeAudioFormat(this.config.input_audio_format || 'pcm16'),
        ...(this.config.input_audio_transcription !== undefined && {
          transcription: this.config.input_audio_transcription,
        }),
        ...(this.config.turn_detection !== undefined && {
          turn_detection: this.config.turn_detection,
        }),
      },
      output: {
        format: this.getRealtimeAudioFormat(this.config.output_audio_format || 'pcm16'),
        voice: this.config.voice || 'alloy',
      },
    };
  }

  private normalizeRealtimeUserContentItem(content: unknown): RealtimeUserContent | null {
    if (!content || typeof content !== 'object') {
      return null;
    }

    const candidate = content as Record<string, unknown>;

    if (
      (candidate.type === 'text' || candidate.type === 'input_text') &&
      typeof candidate.text === 'string'
    ) {
      return {
        type: 'input_text',
        text: candidate.text,
      };
    }

    if (candidate.type === 'input_audio' && typeof candidate.audio === 'string') {
      return {
        type: 'input_audio',
        audio: candidate.audio,
      };
    }

    if (candidate.type === 'input_image' && typeof candidate.image_url === 'string') {
      return {
        type: 'input_image',
        image_url: candidate.image_url,
      };
    }

    return null;
  }

  private getRealtimeUserContent(prompt: string): RealtimeUserContent[] {
    try {
      const parsedPrompt = JSON.parse(prompt);

      if (Array.isArray(parsedPrompt) && parsedPrompt.length > 0) {
        for (let i = parsedPrompt.length - 1; i >= 0; i--) {
          const message = parsedPrompt[i];
          if (!message || typeof message !== 'object' || message.role !== 'user') {
            continue;
          }

          if (typeof message.content === 'string') {
            return [{ type: 'input_text', text: message.content }];
          }

          if (Array.isArray(message.content)) {
            const normalizedContent = message.content
              .map((content: unknown) => this.normalizeRealtimeUserContentItem(content))
              .filter(
                (content: RealtimeUserContent | null): content is RealtimeUserContent =>
                  content !== null,
              );

            if (normalizedContent.length > 0) {
              return normalizedContent;
            }
          }
        }
      } else if (
        parsedPrompt &&
        typeof parsedPrompt === 'object' &&
        typeof parsedPrompt.prompt === 'string'
      ) {
        return [{ type: 'input_text', text: parsedPrompt.prompt }];
      }
    } catch {
      logger.debug('Using prompt as is - not a JSON structure');
    }

    return [{ type: 'input_text', text: prompt }];
  }

  private normalizeRealtimePromptContent(
    prompt: string | RealtimeUserContent[],
  ): RealtimeUserContent[] {
    return typeof prompt === 'string' ? this.getRealtimeUserContent(prompt) : prompt;
  }

  private async getRealtimeSessionConfig(
    realtimeToolConfig?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const toolConfig = realtimeToolConfig ?? (await this.getRealtimeToolConfig());

    return {
      type: 'realtime',
      model: this.modelName,
      output_modalities: this.getRealtimeOutputModalities(),
      instructions: this.config.instructions || 'You are a helpful assistant.',
      audio: this.getRealtimeAudioConfig(),
      max_output_tokens: this.getMaxResponseOutputTokens(),
      ...(this.config.parallel_tool_calls !== undefined && {
        parallel_tool_calls: this.config.parallel_tool_calls,
      }),
      ...(this.config.reasoning !== undefined && {
        reasoning: this.config.reasoning,
      }),
      ...toolConfig,
    };
  }

  private async getRealtimeResponseConfig(
    realtimeToolConfig?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const toolConfig = realtimeToolConfig ?? (await this.getRealtimeToolConfig());

    return {
      output_modalities: this.getRealtimeOutputModalities(),
      instructions: this.config.instructions || 'You are a helpful assistant.',
      audio: {
        output: this.getRealtimeAudioConfig().output,
      },
      max_output_tokens: this.getMaxResponseOutputTokens(),
      ...(this.config.parallel_tool_calls !== undefined && {
        parallel_tool_calls: this.config.parallel_tool_calls,
      }),
      ...(this.config.reasoning !== undefined && {
        reasoning: this.config.reasoning,
      }),
      ...toolConfig,
    };
  }

  private getMaxResponseOutputTokens(): number | 'inf' {
    const value = this.config.max_response_output_tokens;
    if (value === 'inf') {
      return value;
    }
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= MAX_RESPONSE_OUTPUT_TOKENS_MAX
    ) {
      return value;
    }
    if (value !== undefined) {
      logger.debug(
        `Invalid Realtime max_response_output_tokens value ${JSON.stringify(value)}; using 'inf'`,
      );
    }
    return 'inf';
  }

  constructor(
    modelName: string,
    options: { config?: OpenAiRealtimeOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (NON_CONVERSATIONAL_REALTIME_MODELS.has(modelName)) {
      throw new Error(
        `OpenAI ${modelName} is not a conversational Realtime model and cannot be used as ` +
          `openai:realtime:${modelName}. ` +
          (modelName === 'gpt-realtime-whisper'
            ? 'Pass it as input_audio_transcription.model inside a conversational session instead.'
            : 'It uses a separate Realtime session endpoint not yet supported by promptfoo.'),
      );
    }
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

  // Resolve a tool-iteration cap with a sane default and clamp on absurd values.
  private getMaxToolIterations(): number {
    const value = this.config.maxToolIterations;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 64) {
      return Math.floor(value);
    }
    return DEFAULT_MAX_TOOL_ITERATIONS;
  }

  // Resolve per-call tool timeout. Falls back to websocketTimeout, then a hard default.
  private getToolCallTimeoutMs(): number {
    const explicit = this.config.toolCallTimeout;
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
      return explicit;
    }
    return this.config.websocketTimeout || DEFAULT_TOOL_CALL_TIMEOUT_MS;
  }

  // Lazily resolve the tool config (which may load external files) at most
  // once per request, reused across session.update + every response.create.
  // Filled on first await so the WebSocket constructor + handler registration
  // stays synchronous (preserves the unit-test contract that relies on
  // `mockHandlers.open` being attached before the test fires `open`).
  private makeRequestToolConfigCache(): () => Promise<Record<string, unknown>> {
    let cached: Record<string, unknown> | null = null;
    return async () => {
      if (cached === null) {
        cached = await this.getRealtimeToolConfig();
      }
      return cached;
    };
  }

  // The error thrown when a tool→follow-up loop exceeds the configured cap.
  // Centralized so the message stays consistent across all three socket paths.
  // Accepts the partial in-flight state so callApi() can keep the redacted
  // tool outputs in the returned ProviderResponse metadata instead of dropping
  // them on the floor — without this, the user sees an error with empty
  // metadata even though several tool rounds successfully exchanged.
  private toolIterationCapError(
    max: number,
    partial?: RealtimeErrorPartial,
  ): RealtimeErrorWithPartial {
    const err: RealtimeErrorWithPartial = new Error(
      `Realtime tool-call loop exceeded maxToolIterations=${max}; ` +
        'increase config.maxToolIterations if your evaluation legitimately requires deeper chains.',
    );
    if (partial) {
      err.partial = partial;
    }
    return err;
  }

  /**
   * Execute one tool→follow-up round: invoke the user's handler for each
   * pending call (with timeout + return-type validation), forward each result
   * back to the model as `function_call_output`, and on handler error send a
   * redacted generic payload (NOT String(err) — would leak host-side stack
   * snippets and absolute paths into the model context).
   *
   * Both success and handler-failure outputs are pushed to the returned
   * array — failures still represent a tool round that produced output, so
   * callApi() must not mistake them for "no functionCallHandler configured"
   * when surfacing an empty model response.
   *
   * The iteration cap and per-path cleanup (clearTimeout, ws.close,
   * resetRequestTimeout) stay at the call sites because their wiring differs.
   */
  private async runToolCallRound(
    pendingFunctionCalls: ReadonlyArray<{ id: string; name: string; arguments: string }>,
    sendEvent: (event: Record<string, unknown>) => string,
  ): Promise<string[]> {
    const results: string[] = [];
    for (const call of pendingFunctionCalls) {
      try {
        const result = await this.runFunctionCallHandlerWithTimeout(call.name, call.arguments);
        results.push(result);
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.id,
            output: result,
          },
        });
      } catch (err) {
        logger.error(`Realtime functionCallHandler "${call.name}" failed: ${String(err)}`);
        results.push(REDACTED_TOOL_ERROR_OUTPUT);
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.id,
            output: REDACTED_TOOL_ERROR_OUTPUT,
          },
        });
      }
    }
    return results;
  }

  /**
   * Run the user's functionCallHandler with a per-call timeout and return-type
   * validation. Throws on timeout, on non-string return, or on user errors —
   * letting the calling site translate the failure into a redacted
   * function_call_output without leaking host-side error details to the model.
   */
  private async runFunctionCallHandlerWithTimeout(name: string, args: string): Promise<string> {
    const handler = this.config.functionCallHandler;
    if (!handler) {
      throw new Error('functionCallHandler is not configured');
    }
    const timeoutMs = this.getToolCallTimeoutMs();
    let to: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race<string>([
        Promise.resolve(handler(name, args)) as Promise<string>,
        new Promise<string>((_, reject) => {
          to = setTimeout(
            () => reject(new Error(`functionCallHandler "${name}" timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
      if (typeof result !== 'string') {
        throw new Error(`functionCallHandler "${name}" must return a string, got ${typeof result}`);
      }
      return result;
    } finally {
      if (to) {
        clearTimeout(to);
      }
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
    return this.getRealtimeSessionConfig();
  }

  generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  async webSocketRequest(
    clientSecret: string,
    prompt: string | RealtimeUserContent[],
  ): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      const promptContent = this.normalizeRealtimePromptContent(prompt);
      const getCachedToolConfig = this.makeRequestToolConfigCache();
      logger.debug(
        `Attempting to connect to OpenAI WebSocket with client secret: ${clientSecret.slice(0, 5)}...`,
      );

      // The WebSocket URL needs to include the client secret
      const wsUrl = this.getClientSecretSocketUrl(clientSecret);
      logger.debug(`Connecting to WebSocket URL: ${wsUrl.slice(0, 60)}...`);

      // Add WebSocket options to bypass potential network issues
      const wsOptions = {
        headers: {
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: this.getWebSocketOrigin(),
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      // Inactivity-based request timeout. Held in a closure variable so the
      // tool-round site can pause it (clearTimeout) before awaiting user code
      // and restart it afterwards — without that, a slow functionCallHandler
      // can be killed by the outer timeout before we get to send the redacted
      // function_call_output and request the follow-up response.
      const startRequestTimeout = () =>
        setTimeout(() => {
          logger.error('WebSocket connection timed out');
          ws.close();
          reject(new Error('WebSocket connection timed out'));
        }, this.config.websocketTimeout || 30000);
      let timeout = startRequestTimeout();

      // Accumulators for response text and errors
      let responseText = '';
      let responseError = '';
      let responseDone = false;
      let usage = null;

      // Audio content accumulators
      const audioContent: Buffer[] = [];
      let audioFormat = 'wav';
      let hasAudioContent = false;

      // Track message IDs and function call state
      let messageId = '';
      let responseId = '';
      let pendingFunctionCalls: { id: string; name: string; arguments: string }[] = [];
      let functionCallOccurred = false;
      const functionCallResults: string[] = [];
      let toolIterations = 0;
      const maxToolIterations = this.getMaxToolIterations();

      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      ws.on('open', async () => {
        logger.debug('WebSocket connection established successfully');

        // Create a conversation item with the user's prompt - immediately after connection
        // Don't send ping event as it's not supported
        sendEvent({
          type: 'conversation.item.create',
          previous_item_id: null,
          item: {
            type: 'message',
            role: 'user',
            content: promptContent,
          },
        });
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.debug(`Received WebSocket message: ${message.type}`);

          // For better debugging, log the full message structure (without potentially large audio data)
          const debugMessage = { ...message };
          if (debugMessage.audio) {
            debugMessage.audio = '[AUDIO_DATA]';
          }
          logger.debug(`Message data: ${JSON.stringify(debugMessage, null, 2)}`);

          // Handle different event types
          switch (message.type) {
            case 'session.ready':
              logger.debug('Session ready on WebSocket');

              // Create a conversation item with the user's prompt
              sendEvent({
                type: 'conversation.item.create',
                previous_item_id: null,
                item: {
                  type: 'message',
                  role: 'user',
                  content: promptContent,
                },
              });
              break;

            case 'session.created':
              logger.debug('Session created on WebSocket');
              // No need to do anything here as we'll wait for session.ready
              break;

            case 'conversation.item.created':
            case 'conversation.item.added':
            case 'conversation.item.done':
              if (message.item.role === 'user' && message.item.id !== messageId) {
                // User message was created, now create a response
                messageId = message.item.id;

                // Prepare response creation event with appropriate settings
                const responseEvent: any = {
                  type: 'response.create',
                  response: await this.getRealtimeResponseConfig(await getCachedToolConfig()),
                };

                sendEvent(responseEvent);
              }
              break;

            case 'response.created':
              responseId = message.response.id;
              break;

            case 'response.text.delta':
            case 'response.output_text.delta':
              // Accumulate text deltas
              responseText += message.delta;
              logger.debug(
                `Added text delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.text.done':
            case 'response.output_text.done':
              // Final text content
              if (message.text && message.text.length > 0) {
                logger.debug(
                  `Setting final text content from response.text.done: "${message.text}" (length: ${message.text.length})`,
                );
                responseText = message.text;
              } else {
                logger.debug('Received empty text in response.text.done');
              }
              break;

            // Handle content part events
            case 'response.content_part.added':
              // Log that we received a content part
              logger.debug(`Received content part: ${JSON.stringify(message.content_part)}`);

              // Track content part ID if needed for later reference
              if (message.content_part && message.content_part.id) {
                logger.debug(`Content part added with ID: ${message.content_part.id}`);
              }
              break;

            case 'response.content_part.done':
              logger.debug('Content part completed');
              break;

            // Handle audio transcript events
            case 'response.audio_transcript.delta':
            case 'response.output_audio_transcript.delta':
              // Accumulate audio transcript deltas - this is the text content
              responseText += message.delta;
              logger.debug(
                `Added audio transcript delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.audio_transcript.done':
            case 'response.output_audio_transcript.done':
              // Final audio transcript content
              if (message.text && message.text.length > 0) {
                logger.debug(
                  `Setting final audio transcript text: "${message.text}" (length: ${message.text.length})`,
                );
                responseText = message.text;
              } else {
                logger.debug('Received empty text in response.audio_transcript.done');
              }
              break;

            // Handle audio data events - store in metadata if needed
            case 'response.audio.delta':
            case 'response.output_audio.delta':
              // Handle audio data (could store in metadata for playback if needed)
              // For gpt-realtime, audio data is in the 'delta' field, not 'audio' field
              const audioData = message.audio || message.delta;
              logger.debug(
                `Received audio data chunk: delta field exists=${!!message.delta}, length=${message.delta ? message.delta.length : 0}`,
              );

              if (audioData && audioData.length > 0) {
                // Store the audio data for later use
                try {
                  const audioBuffer = Buffer.from(audioData, 'base64');
                  audioContent.push(audioBuffer);
                  hasAudioContent = true;
                  logger.debug(
                    `Successfully processed audio chunk: ${audioBuffer.length} bytes, total chunks: ${audioContent.length}`,
                  );
                } catch (error) {
                  logger.error(`Error processing audio data: ${error}`);
                }
              } else {
                logger.debug(
                  `Audio delta received but no audio data present. Message fields: ${Object.keys(message).join(', ')}`,
                );
              }
              break;

            case 'response.audio.done':
            case 'response.output_audio.done':
              logger.debug('Audio data complete');
              // If audio format is specified in the message, capture it
              if (message.format) {
                audioFormat = message.format;
              }
              break;

            // Handle output items (including function calls)
            case 'response.output_item.added':
              if (message.item.type === 'function_call') {
                functionCallOccurred = true;

                // Store the function call details for later handling
                pendingFunctionCalls.push({
                  id: message.item.call_id,
                  name: message.item.name,
                  arguments: message.item.arguments || '{}',
                });
              } else if (message.item.type === 'text') {
                // Handle text output item - also add to responseText
                if (message.item.text) {
                  responseText += message.item.text;
                  logger.debug(
                    `Added text output item: "${message.item.text}", current length: ${responseText.length}`,
                  );
                } else {
                  logger.debug('Received text output item with empty text');
                }
              } else {
                // Log other output item types
                logger.debug(`Received output item of type: ${message.item.type}`);
              }
              break;

            case 'response.output_item.done':
              logger.debug('Output item complete');
              break;

            case 'response.function_call_arguments.done':
              // Find the function call in our pending list and update its arguments
              const callIndex = pendingFunctionCalls.findIndex(
                (call) => call.id === message.call_id,
              );
              if (callIndex !== -1) {
                pendingFunctionCalls[callIndex].arguments = message.arguments;
              }
              break;

            case 'response.done':
              responseDone = true;
              usage = message.response.usage;

              // If there are pending function calls, process them
              if (pendingFunctionCalls.length > 0 && this.config.functionCallHandler) {
                if (toolIterations >= maxToolIterations) {
                  clearTimeout(timeout);
                  ws.close();
                  reject(
                    this.toolIterationCapError(maxToolIterations, {
                      functionCallOccurred,
                      functionCallResults: [...functionCallResults],
                    }),
                  );
                  return;
                }
                toolIterations++;
                // Pause the inactivity timeout while user code runs — handler
                // execution time is not WebSocket inactivity, and a slow
                // handler must not be killed by the outer timeout before the
                // redacted function_call_output reaches the model.
                clearTimeout(timeout);
                const roundResults = await this.runToolCallRound(pendingFunctionCalls, sendEvent);
                functionCallResults.push(...roundResults);

                // Request a new response from the model using the function results
                sendEvent({
                  type: 'response.create',
                });
                timeout = startRequestTimeout();

                // Start a fresh turn for the model's follow-up response.
                responseText = '';
                responseError = '';
                audioContent.length = 0;
                audioFormat = 'wav';
                hasAudioContent = false;
                pendingFunctionCalls = [];
                responseDone = false;

                // Don't resolve the promise yet - wait for the final response
                return;
              }

              // If no function calls or we've processed them all, close the connection
              clearTimeout(timeout);

              // Check if we have an empty response and try to diagnose the issue
              if (responseText.length === 0) {
                // Only log at debug level to prevent user-visible warnings
                logger.debug(
                  'Empty response detected before resolving. Checking response message details',
                );
                logger.debug('Response message details: ' + JSON.stringify(message, null, 2));

                // Try to extract any text content from the message as a fallback
                if (
                  message.response &&
                  message.response.content &&
                  Array.isArray(message.response.content)
                ) {
                  const textContent = message.response.content.find(
                    (item: any) => item.type === 'text' && item.text && item.text.length > 0,
                  );

                  if (textContent) {
                    logger.debug(
                      `Found text in response content, using as fallback: "${textContent.text}"`,
                    );
                    responseText = textContent.text;
                  } else {
                    logger.debug('No fallback text content found in response message');
                  }
                }

                // Leave responseText empty — callApi() converts an empty
                // response (with no audio or function-call results) into an
                // error so the caller's assertion fails with diagnostic text
                // rather than a placeholder masquerading as success.
              }

              ws.close();

              // Check if audio was generated based on usage tokens (for gpt-realtime)
              if (
                usage?.output_token_details?.audio_tokens &&
                usage.output_token_details.audio_tokens > 0
              ) {
                if (!hasAudioContent) {
                  hasAudioContent = true;
                }
                // For gpt-realtime model, audio data is PCM16 but we need to convert to WAV for browser playback
                audioFormat = 'wav';
                logger.debug(
                  `Audio detected from usage tokens: ${usage.output_token_details.audio_tokens} audio tokens, converting PCM16 to WAV format`,
                );
              }

              // Prepare audio data if available
              let finalAudioData = null;
              if (hasAudioContent && audioContent.length > 0) {
                try {
                  const rawPcmData = Buffer.concat(audioContent);
                  // Convert PCM16 to WAV for browser compatibility
                  const wavData = convertPcm16ToWav(rawPcmData);
                  finalAudioData = wavData.toString('base64');
                  logger.debug(
                    `Audio conversion: PCM16 ${rawPcmData.length} bytes -> WAV ${wavData.length} bytes`,
                  );
                } catch (error) {
                  logger.error(`Error converting audio data to WAV format: ${error}`);
                  // Still set hasAudioContent to false if conversion fails
                  hasAudioContent = false;
                }
              }

              logger.debug(
                `AUDIO TRACE: Before resolve - hasAudioContent=${hasAudioContent}, audioContent.length=${audioContent.length}, finalAudioData.length=${finalAudioData?.length || 0}`,
              );
              logger.debug(
                `AUDIO TRACE: audioFormat=${audioFormat}, responseText.length=${responseText.length}`,
              );

              resolve({
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
                  // Include audio data in metadata if available
                  ...(hasAudioContent && {
                    audio: {
                      data: finalAudioData,
                      format: audioFormat,
                      transcript: responseText, // Use the text as transcript since we have it
                    },
                  }),
                },
                functionCallOccurred,
                functionCallResults:
                  functionCallResults.length > 0 ? functionCallResults : undefined,
                // When the model emitted function_calls but no handler ran
                // (no functionCallHandler configured), surface the names so
                // the empty-response error in callApi() tells the user *which*
                // tools the model tried to invoke.
                attemptedFunctionCalls:
                  functionCallOccurred && functionCallResults.length === 0
                    ? pendingFunctionCalls.map((c) => ({ name: c.name }))
                    : undefined,
              });
              break;

            case 'rate_limits.updated':
              // Store rate limits in metadata if needed
              logger.debug(`Rate limits updated: ${JSON.stringify(message.rate_limits)}`);
              break;

            case 'error':
              responseError = `Error: ${message.error.message}`;
              logger.error(`WebSocket error: ${responseError} (${message.error.type})`);

              // Always close on errors to prevent hanging connections
              clearTimeout(timeout);
              ws.close();
              reject(new Error(responseError));
              break;
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

        // Provide more detailed error messages for common WebSocket close codes
        if (code === 1006) {
          logger.error(
            'WebSocket connection closed abnormally - this often indicates a network or firewall issue',
          );
        } else if (code === 1008) {
          logger.error(
            'WebSocket connection rejected due to policy violation (possibly wrong API key or permissions)',
          );
        } else if (code === 403 || reason.includes('403')) {
          logger.error(
            'WebSocket connection received 403 Forbidden - verify API key permissions and rate limits',
          );
        }

        // Only reject if we haven't received a completed response or error
        const connectionClosedPrematurely = responseDone === false && responseError.length === 0;
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

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
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
      const promptContent = this.getRealtimeUserContent(prompt);

      // Use a persistent connection if we should maintain conversation context
      let result;
      if (this.config.maintainContext === true) {
        result = await this.persistentWebSocketRequest(promptContent);
      } else {
        // Connect directly to the WebSocket API using API key
        logger.debug(`Connecting directly to OpenAI Realtime API WebSocket with API key`);
        result = await this.directWebSocketRequest(promptContent);
      }

      let finalOutput = result.output;
      const hasAudio = Boolean(result.metadata?.audio);
      const hasFunctionResults = Boolean(
        result.functionCallOccurred &&
          result.functionCallResults &&
          result.functionCallResults.length > 0,
      );

      logger.debug(`Final output from API: "${finalOutput}" (length: ${finalOutput.length})`);

      // An empty response with no audio and no function-call results is a real
      // failure (wire-shape regression, unhandled tool call, etc.) — surface it
      // as a ProviderResponse error so assertions fail with a useful message
      // instead of silently passing/failing against a placeholder string.
      if (finalOutput.length === 0 && !hasAudio && !hasFunctionResults) {
        const attemptedNames = result.attemptedFunctionCalls
          ?.map((c) => c.name)
          .filter((name): name is string => Boolean(name));
        const baseHint = result.functionCallOccurred
          ? 'A function_call was emitted by the model but no functionCallHandler was configured to respond.'
          : 'No text, audio, or function-call output was returned. This often indicates a wire-shape mismatch with the Realtime API.';
        // Naming the attempted tool(s) makes this error actionable — without
        // it the user has to dig through debug logs to find which function
        // the model picked.
        const hint =
          attemptedNames && attemptedNames.length > 0
            ? `${baseHint} Attempted: ${attemptedNames.join(', ')}.`
            : baseHint;
        return {
          error: `OpenAI Realtime returned an empty response. ${hint}`,
          metadata: {
            ...(result.metadata ?? {}),
            functionCallOccurred: result.functionCallOccurred,
            ...(result.attemptedFunctionCalls && {
              attemptedFunctionCalls: result.attemptedFunctionCalls,
            }),
          },
          tokenUsage: result.tokenUsage,
        };
      }

      if (finalOutput.length === 0 && hasAudio) {
        finalOutput = '[Audio response received]';
      }

      if (hasFunctionResults) {
        finalOutput += '\n\n[Function calls were made during processing]';
      }

      // Construct the metadata with audio if available
      const metadata = {
        ...result.metadata,
        functionCallOccurred: result.functionCallOccurred,
        functionCallResults: result.functionCallResults,
      };

      // If the response has audio data, format it according to the promptfoo audio interface
      if (result.metadata?.audio) {
        // Convert Buffer to base64 string for the audio data
        const audioDataBase64 = result.metadata.audio.data;

        metadata.audio = {
          data: audioDataBase64,
          format: result.metadata.audio.format,
          transcript: result.output, // Use the text output as transcript
        };

        logger.debug(
          `AUDIO TRACE: Main callApi - Found result.metadata.audio, data.length=${audioDataBase64?.length || 0}, format=${result.metadata.audio.format}`,
        );
      } else {
        logger.debug(
          `AUDIO TRACE: Main callApi - No result.metadata.audio found. result.metadata keys: ${Object.keys(result.metadata || {}).join(', ')}`,
        );
      }

      const cost = calculateOpenAIUsageCost(
        this.modelName,
        this.config,
        result.metadata?.usage ?? {
          prompt_tokens: result.tokenUsage?.prompt,
          completion_tokens: result.tokenUsage?.completion,
          total_tokens: result.tokenUsage?.total,
        },
        {
          cachedResponse: result.cached,
        },
      );
      return {
        output: finalOutput,
        tokenUsage: result.tokenUsage,
        cached: result.cached,
        cost,
        metadata,
        // Add audio at top level if available (EvalOutputCell expects this)
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
      // If this is an Unexpected server response: 403, add additional troubleshooting info
      if (errorMessage.includes('403')) {
        logger.error(`
        This 403 error usually means one of the following:
        1. WebSocket connections are blocked by your network/firewall
        2. Your OpenAI API key doesn't have access to the Realtime API
        3. There are rate limits or quotas in place for your account
        Try:
        - Using a different network connection
        - Checking your OpenAI API key permissions
        - Verifying you have access to the Realtime API`);
      }
      // Preserve any partial state the in-flight request attached to the
      // error (e.g., the redacted tool outputs already exchanged when the
      // iteration cap fired). Without this, users see an error with empty
      // metadata even though several tool rounds had completed.
      const partial = (err as RealtimeErrorWithPartial)?.partial;
      const metadata: Record<string, unknown> = {};
      if (partial?.functionCallOccurred !== undefined) {
        metadata.functionCallOccurred = partial.functionCallOccurred;
      }
      if (partial?.functionCallResults && partial.functionCallResults.length > 0) {
        metadata.functionCallResults = partial.functionCallResults;
      }
      return {
        error: errorMessage,
        metadata,
      };
    }
  }

  async directWebSocketRequest(prompt: string | RealtimeUserContent[]): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      const getCachedToolConfig = this.makeRequestToolConfigCache();
      const promptContent = this.normalizeRealtimePromptContent(prompt);
      logger.debug(`Establishing direct WebSocket connection to OpenAI Realtime API`);

      // Construct URL with model parameter
      const wsUrl = this.getWebSocketUrl(this.modelName);
      logger.debug(`Connecting to WebSocket URL: ${wsUrl}`);

      // Add WebSocket options with required headers
      const wsOptions = {
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: this.getWebSocketOrigin(),
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      // Inactivity-based request timeout. Held in a closure variable so the
      // tool-round site can pause it (clearTimeout) before awaiting user code
      // and restart it afterwards — without that, a slow functionCallHandler
      // can be killed by the outer timeout before we get to send the redacted
      // function_call_output and request the follow-up response.
      const startRequestTimeout = () =>
        setTimeout(() => {
          logger.error('WebSocket connection timed out');
          ws.close();
          reject(new Error('WebSocket connection timed out'));
        }, this.config.websocketTimeout || 30000);
      let timeout = startRequestTimeout();

      // Accumulators for response text and errors
      let responseText = '';
      let responseError = '';
      let responseDone = false;
      let usage = null;

      // Audio content accumulators
      const audioContent: Buffer[] = [];
      let audioFormat = 'wav';
      let hasAudioContent = false;

      // Track message IDs and function call state
      let messageId = '';
      let responseId = '';
      let pendingFunctionCalls: { id: string; name: string; arguments: string }[] = [];
      let functionCallOccurred = false;
      const functionCallResults: string[] = [];
      let toolIterations = 0;
      const maxToolIterations = this.getMaxToolIterations();
      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      ws.on('open', async () => {
        try {
          logger.debug('WebSocket connection established successfully');

          // First, update the session with our configuration
          sendEvent({
            type: 'session.update',
            session: await this.getRealtimeSessionConfig(await getCachedToolConfig()),
          });

          // Then create a conversation item with the user's prompt
          sendEvent({
            type: 'conversation.item.create',
            previous_item_id: null,
            item: {
              type: 'message',
              role: 'user',
              content: promptContent,
            },
          });
        } catch (error) {
          clearTimeout(timeout);
          ws.close();
          reject(error);
        }
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          logger.debug(`Received WebSocket message: ${message.type}`);

          // For better debugging, log the full message structure (without potentially large audio data)
          const debugMessage = { ...message };
          if (debugMessage.audio) {
            debugMessage.audio = '[AUDIO_DATA]';
          }
          logger.debug(`Message data: ${JSON.stringify(debugMessage, null, 2)}`);

          // Handle different event types
          switch (message.type) {
            case 'session.created':
              logger.debug('Session created on WebSocket');
              break;

            case 'session.updated':
              logger.debug('Session updated on WebSocket');
              break;

            case 'conversation.item.created':
            case 'conversation.item.added':
            case 'conversation.item.done':
              if (message.item.role === 'user' && message.item.id !== messageId) {
                // User message was created, now create a response
                messageId = message.item.id;

                // Prepare response creation event with appropriate settings
                const responseEvent: any = {
                  type: 'response.create',
                  response: await this.getRealtimeResponseConfig(await getCachedToolConfig()),
                };

                sendEvent(responseEvent);
              }
              break;

            case 'response.created':
              responseId = message.response.id;
              break;

            case 'response.text.delta':
            case 'response.output_text.delta':
              // Accumulate text deltas
              responseText += message.delta;
              logger.debug(
                `Added text delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.text.done':
            case 'response.output_text.done':
              // Final text content
              if (message.text && message.text.length > 0) {
                logger.debug(
                  `Setting final text content from response.text.done: "${message.text}" (length: ${message.text.length})`,
                );
                responseText = message.text;
              } else {
                logger.debug('Received empty text in response.text.done');
              }
              break;

            // Handle content part events
            case 'response.content_part.added':
              // Log that we received a content part
              logger.debug(`Received content part: ${JSON.stringify(message.content_part)}`);

              // Track content part ID if needed for later reference
              if (message.content_part && message.content_part.id) {
                logger.debug(`Content part added with ID: ${message.content_part.id}`);
              }
              break;

            case 'response.content_part.done':
              logger.debug('Content part completed');
              break;

            // Handle audio transcript events
            case 'response.audio_transcript.delta':
            case 'response.output_audio_transcript.delta':
              // Accumulate audio transcript deltas - this is the text content
              responseText += message.delta;
              logger.debug(
                `Added audio transcript delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.audio_transcript.done':
            case 'response.output_audio_transcript.done':
              // Final audio transcript content
              if (message.text && message.text.length > 0) {
                logger.debug(
                  `Setting final audio transcript text: "${message.text}" (length: ${message.text.length})`,
                );
                responseText = message.text;
              } else {
                logger.debug('Received empty text in response.audio_transcript.done');
              }
              break;

            // Handle audio data events - store in metadata if needed
            case 'response.audio.delta':
            case 'response.output_audio.delta':
              // Handle audio data (could store in metadata for playback if needed)
              // For gpt-realtime, audio data is in the 'delta' field, not 'audio' field
              const audioData = message.audio || message.delta;
              logger.debug(
                `Received audio data chunk: delta field exists=${!!message.delta}, length=${message.delta ? message.delta.length : 0}`,
              );

              if (audioData && audioData.length > 0) {
                // Store the audio data for later use
                try {
                  const audioBuffer = Buffer.from(audioData, 'base64');
                  audioContent.push(audioBuffer);
                  hasAudioContent = true;
                  logger.debug(
                    `Successfully processed audio chunk: ${audioBuffer.length} bytes, total chunks: ${audioContent.length}`,
                  );
                } catch (error) {
                  logger.error(`Error processing audio data: ${error}`);
                }
              } else {
                logger.debug(
                  `Audio delta received but no audio data present. Message fields: ${Object.keys(message).join(', ')}`,
                );
              }
              break;

            case 'response.audio.done':
            case 'response.output_audio.done':
              logger.debug('Audio data complete');
              // If audio format is specified in the message, capture it
              if (message.format) {
                audioFormat = message.format;
              }
              break;

            // Handle output items (including function calls)
            case 'response.output_item.added':
              if (message.item.type === 'function_call') {
                functionCallOccurred = true;

                // Store the function call details for later handling
                pendingFunctionCalls.push({
                  id: message.item.call_id,
                  name: message.item.name,
                  arguments: message.item.arguments || '{}',
                });
              } else if (message.item.type === 'text') {
                // Handle text output item - also add to responseText
                if (message.item.text) {
                  responseText += message.item.text;
                  logger.debug(
                    `Added text output item: "${message.item.text}", current length: ${responseText.length}`,
                  );
                } else {
                  logger.debug('Received text output item with empty text');
                }
              } else {
                // Log other output item types
                logger.debug(`Received output item of type: ${message.item.type}`);
              }
              break;

            case 'response.output_item.done':
              logger.debug('Output item complete');
              break;

            case 'response.function_call_arguments.done':
              // Find the function call in our pending list and update its arguments
              const callIndex = pendingFunctionCalls.findIndex(
                (call) => call.id === message.call_id,
              );
              if (callIndex !== -1) {
                pendingFunctionCalls[callIndex].arguments = message.arguments;
              }
              break;

            case 'response.done':
              responseDone = true;
              usage = message.response.usage;

              // If there are pending function calls, process them
              if (pendingFunctionCalls.length > 0 && this.config.functionCallHandler) {
                if (toolIterations >= maxToolIterations) {
                  clearTimeout(timeout);
                  ws.close();
                  reject(
                    this.toolIterationCapError(maxToolIterations, {
                      functionCallOccurred,
                      functionCallResults: [...functionCallResults],
                    }),
                  );
                  return;
                }
                toolIterations++;
                // Pause the inactivity timeout while user code runs — handler
                // execution time is not WebSocket inactivity, and a slow
                // handler must not be killed by the outer timeout before the
                // redacted function_call_output reaches the model.
                clearTimeout(timeout);
                const roundResults = await this.runToolCallRound(pendingFunctionCalls, sendEvent);
                functionCallResults.push(...roundResults);

                // Request a new response from the model using the function results
                sendEvent({
                  type: 'response.create',
                });
                timeout = startRequestTimeout();

                // Start a fresh turn for the model's follow-up response.
                responseText = '';
                responseError = '';
                audioContent.length = 0;
                audioFormat = 'wav';
                hasAudioContent = false;
                pendingFunctionCalls = [];
                responseDone = false;

                // Don't resolve the promise yet - wait for the final response
                return;
              }

              // If no function calls or we've processed them all, close the connection
              clearTimeout(timeout);

              // Check if we have an empty response and try to diagnose the issue
              if (responseText.length === 0) {
                // Only log at debug level to prevent user-visible warnings
                logger.debug(
                  'Empty response detected before resolving. Checking response message details',
                );
                logger.debug('Response message details: ' + JSON.stringify(message, null, 2));

                // Try to extract any text content from the message as a fallback
                if (
                  message.response &&
                  message.response.content &&
                  Array.isArray(message.response.content)
                ) {
                  const textContent = message.response.content.find(
                    (item: any) => item.type === 'text' && item.text && item.text.length > 0,
                  );

                  if (textContent) {
                    logger.debug(
                      `Found text in response content, using as fallback: "${textContent.text}"`,
                    );
                    responseText = textContent.text;
                  } else {
                    logger.debug('No fallback text content found in response message');
                  }
                }

                // Leave responseText empty — callApi() converts an empty
                // response (with no audio or function-call results) into an
                // error so the caller's assertion fails with diagnostic text
                // rather than a placeholder masquerading as success.
              }

              ws.close();

              // Check if audio was generated based on usage tokens (for gpt-realtime)
              if (
                usage?.output_token_details?.audio_tokens &&
                usage.output_token_details.audio_tokens > 0
              ) {
                if (!hasAudioContent) {
                  hasAudioContent = true;
                }
                // For gpt-realtime model, audio data is PCM16 but we need to convert to WAV for browser playback
                audioFormat = 'wav';
                logger.debug(
                  `Audio detected from usage tokens: ${usage.output_token_details.audio_tokens} audio tokens, converting PCM16 to WAV format`,
                );
              }

              // Prepare audio data if available
              let finalAudioData = null;
              if (hasAudioContent && audioContent.length > 0) {
                try {
                  const rawPcmData = Buffer.concat(audioContent);
                  // Convert PCM16 to WAV for browser compatibility
                  const wavData = convertPcm16ToWav(rawPcmData);
                  finalAudioData = wavData.toString('base64');
                  logger.debug(
                    `Audio conversion: PCM16 ${rawPcmData.length} bytes -> WAV ${wavData.length} bytes`,
                  );
                } catch (error) {
                  logger.error(`Error converting audio data to WAV format: ${error}`);
                  // Still set hasAudioContent to false if conversion fails
                  hasAudioContent = false;
                }
              }

              logger.debug(
                `AUDIO TRACE: Before resolve - hasAudioContent=${hasAudioContent}, audioContent.length=${audioContent.length}, finalAudioData.length=${finalAudioData?.length || 0}`,
              );
              logger.debug(
                `AUDIO TRACE: audioFormat=${audioFormat}, responseText.length=${responseText.length}`,
              );

              resolve({
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
                  // Include audio data in metadata if available
                  ...(hasAudioContent && {
                    audio: {
                      data: finalAudioData,
                      format: audioFormat,
                      transcript: responseText, // Use the text as transcript since we have it
                    },
                  }),
                },
                functionCallOccurred,
                functionCallResults:
                  functionCallResults.length > 0 ? functionCallResults : undefined,
                // When the model emitted function_calls but no handler ran
                // (no functionCallHandler configured), surface the names so
                // the empty-response error in callApi() tells the user *which*
                // tools the model tried to invoke.
                attemptedFunctionCalls:
                  functionCallOccurred && functionCallResults.length === 0
                    ? pendingFunctionCalls.map((c) => ({ name: c.name }))
                    : undefined,
              });
              break;

            case 'rate_limits.updated':
              // Store rate limits in metadata if needed
              logger.debug(`Rate limits updated: ${JSON.stringify(message.rate_limits)}`);
              break;

            case 'error':
              responseError = `Error: ${message.error.message}`;
              logger.error(`WebSocket error: ${responseError} (${message.error.type})`);

              // Always close on errors to prevent hanging connections
              clearTimeout(timeout);
              ws.close();
              reject(new Error(responseError));
              break;
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

        // Provide more detailed error messages for common WebSocket close codes
        if (code === 1006) {
          logger.error(
            'WebSocket connection closed abnormally - this often indicates a network or firewall issue',
          );
        } else if (code === 1008) {
          logger.error(
            'WebSocket connection rejected due to policy violation (possibly wrong API key or permissions)',
          );
        } else if (code === 403 || reason.includes('403')) {
          logger.error(
            'WebSocket connection received 403 Forbidden - verify API key permissions and rate limits',
          );
        }

        // Only reject if we haven't received a completed response or error
        const connectionClosedPrematurely = responseDone === false && responseError.length === 0;
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
   * Tear down all cached persistent-connection state so the next call to
   * openPersistentConnection() creates a fresh socket. Centralizing this is
   * load-bearing: leaving connectionReady resolved after the underlying socket
   * has died makes openPersistentConnection() return immediately, after which
   * setupMessageHandlers finds persistentConnection === null and the turn
   * fails with "persistent WebSocket is not set" instead of reconnecting.
   *
   * We deliberately do NOT reset `inflightTurn` here. `persistentWebSocketRequest`
   * always re-anchors `inflightTurn` to a `.catch(() => undefined)` wrapper, so
   * the queue never holds a rejecting promise — already-queued turns will
   * naturally proceed once the failed turn settles. Resetting `inflightTurn`
   * to `Promise.resolve()` here would let a brand-new turn arriving after
   * teardown bypass turns still awaiting the failed one, which reintroduces
   * the same handler-interleaving race this PR aims to prevent.
   */
  private tearDownPersistentConnection(reason: string): void {
    if (this.persistentConnection != null) {
      logger.debug(`Tearing down persistent connection: ${reason}`);
    }
    this.persistentConnectionLifecycleCleanup?.();
    this.persistentConnectionLifecycleCleanup = null;
    this.persistentConnection = null;
    this.connectionReady = null;
  }

  // Treat CONNECTING/OPEN as live; CLOSING/CLOSED (or undefined readyState on
  // a mock that's been "closed" without setting one) as dead. We avoid the
  // wsState constants so this works for both real ws sockets and the
  // lightweight mocks in unit tests.
  private isPersistentConnectionLive(): boolean {
    const ws = this.persistentConnection;
    if (ws == null) {
      return false;
    }
    if (typeof ws.readyState !== 'number') {
      return true;
    }
    return ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN;
  }

  /**
   * Keep lifecycle listeners attached while the shared socket is idle between
   * turns. Turn-specific listeners are intentionally removed after each
   * response, but Node treats an unhandled EventEmitter `error` as a process
   * exception.
   */
  private installPersistentConnectionLifecycleHandlers(ws: WebSocket): void {
    this.persistentConnectionLifecycleCleanup?.();

    const onIdleError = (error: Error) => {
      logger.error(`Persistent WebSocket error while idle: ${error}`);
      if (this.persistentConnection === ws) {
        this.tearDownPersistentConnection(`idle socket error: ${error.message}`);
      }
    };
    const onIdleClose = (code: number, reason: Buffer) => {
      const message = formatCloseMessage('Persistent WebSocket closed while idle', code, reason);
      logger.debug(message);
      if (this.persistentConnection === ws) {
        this.tearDownPersistentConnection(`idle socket close: code=${code}`);
      }
    };

    ws.on('error', onIdleError);
    ws.on('close', onIdleClose);
    this.persistentConnectionLifecycleCleanup = () => {
      ws.removeListener('error', onIdleError);
      ws.removeListener('close', onIdleClose);
    };
  }

  /**
   * Open the persistent socket and resolve only once it has reached readyState OPEN.
   * Concurrent callers share the same Promise so they all wait for the same socket
   * to be ready before any of them send events.
   *
   * On error/close before OPEN, both the socket and the cached promise are torn
   * down so the next request creates a fresh connection.
   */
  private openPersistentConnection(): Promise<void> {
    // Reuse the cached promise only if the underlying socket is still live.
    // After a disconnect, connectionReady can remain resolved while the
    // socket has been nulled — returning it would skip reconnection and the
    // next turn would fail in sendEvent.
    if (this.connectionReady != null && this.isPersistentConnectionLive()) {
      return this.connectionReady;
    }
    // Cache is stale; clear it so we create a fresh socket below.
    if (this.connectionReady != null) {
      this.tearDownPersistentConnection('cached connectionReady is stale');
    }

    // A pre-existing connection (e.g., one already opened by an earlier
    // request, or a mock injected by a unit test) is treated as ready. The
    // sendEvent guard inside setupMessageHandlers is the runtime safety net.
    if (this.persistentConnection != null) {
      this.installPersistentConnectionLifecycleHandlers(this.persistentConnection);
      this.connectionReady = Promise.resolve();
      return this.connectionReady;
    }

    const wsUrl = this.getWebSocketUrl(this.modelName);
    logger.debug(`Opening persistent WebSocket: ${wsUrl}`);

    const wsOptions = {
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        'User-Agent': 'promptfoo Realtime API Client',
        Origin: this.getWebSocketOrigin(),
      },
      handshakeTimeout: 10000,
      perMessageDeflate: false,
    };

    const ws = new WebSocket(wsUrl, wsOptions);
    this.persistentConnection = ws;

    this.connectionReady = new Promise<void>((resolve, reject) => {
      const removeBeforeOpenListeners = () => {
        ws.removeListener('error', onErrorBeforeOpen);
        ws.removeListener('close', onCloseBeforeOpen);
      };
      const onOpen = () => {
        removeBeforeOpenListeners();
        this.installPersistentConnectionLifecycleHandlers(ws);
        logger.debug('Persistent WebSocket reached OPEN');
        resolve();
      };
      const onErrorBeforeOpen = (err: Error) => {
        ws.removeListener('open', onOpen);
        ws.removeListener('close', onCloseBeforeOpen);
        logger.error(`Persistent WebSocket failed before OPEN: ${err}`);
        if (this.persistentConnection === ws) {
          this.tearDownPersistentConnection(`error before OPEN: ${err.message}`);
        }
        reject(err);
      };
      // A handshake rejection can fire 'close' without a preceding 'error'
      // (e.g., server returns an HTTP error response). Without this listener
      // connectionReady would dangle forever.
      const onCloseBeforeOpen = (code: number, reason: Buffer) => {
        ws.removeListener('open', onOpen);
        ws.removeListener('error', onErrorBeforeOpen);
        const message = formatCloseMessage('Persistent WebSocket closed before OPEN', code, reason);
        logger.error(message);
        if (this.persistentConnection === ws) {
          this.tearDownPersistentConnection(`close before OPEN: code=${code}`);
        }
        reject(new Error(message));
      };
      ws.once('open', onOpen);
      ws.once('error', onErrorBeforeOpen);
      ws.once('close', onCloseBeforeOpen);
    });

    return this.connectionReady;
  }

  /**
   * Persistent-connection turn entry point.
   *
   * Two correctness guarantees that the previous implementation lacked:
   *  1. Wait for the shared socket to reach readyState OPEN before sending —
   *     concurrent callers no longer race past a CONNECTING socket and trigger
   *     "WebSocket is not open: readyState 0".
   *  2. Serialize turns through `inflightTurn` so unrelated tests sharing one
   *     provider instance don't interleave their session.update / response.create
   *     events on the same wire. Failed turns don't block the queue.
   */
  async persistentWebSocketRequest(
    prompt: string | RealtimeUserContent[],
  ): Promise<RealtimeResponse> {
    const promptContent = this.normalizeRealtimePromptContent(prompt);
    const previous = this.inflightTurn;
    const turn = (async () => {
      try {
        await previous;
      } catch {
        // Prior turn errors don't poison the queue.
      }
      await this.openPersistentConnection();
      return new Promise<RealtimeResponse>((resolve, reject) => {
        void this.setupMessageHandlers(promptContent, resolve, reject).catch(reject);
      });
    })();
    this.inflightTurn = turn.catch(() => undefined);
    return turn;
  }

  // Helper method to set up message handlers for persistent WebSocket
  private async setupMessageHandlers(
    prompt: string | RealtimeUserContent[],
    resolve: (value: RealtimeResponse) => void,
    reject: (reason: Error) => void,
  ): Promise<void> {
    // Reset audio state at the start of each request
    this.resetAudioState();
    const promptContent = this.normalizeRealtimePromptContent(prompt);
    // Snapshot before the await so a concurrent turn cannot mutate it under us.
    const previousItemIdAtTurnStart = this.previousItemId;
    const realtimeToolConfig = await this.getRealtimeToolConfigWithTimeout();

    const startRequestTimeout = () =>
      setTimeout(() => {
        logger.error('WebSocket response timed out');
        this.resetAudioState();
        reject(new Error('WebSocket response timed out'));
      }, this.config.websocketTimeout || 30000);

    // Treat the timeout as inactivity-based so follow-up tool turns get a fresh window.
    let requestTimeout = startRequestTimeout();

    const resetRequestTimeout = () => {
      clearTimeout(requestTimeout);
      requestTimeout = startRequestTimeout();
    };

    const clearRequestTimeout = () => {
      clearTimeout(requestTimeout);
    };

    /*
     * Keep a request-level timeout instead of per-message timers so cleanup remains simple while
     * still allowing a tool call plus its follow-up response to take a full timeout window. Pause
     * it while local handlers run because that time is not WebSocket inactivity.
     */

    // Accumulators for response text and errors
    let responseText = '';
    let responseError = '';
    let textDone = false;
    let audioDone = true; // Default to true, set to false when audio processing starts
    let responseDone = false;
    let _usage: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
    } | null = null;

    // Track message IDs and function call state
    let _messageId = '';
    let _responseId = '';
    let functionCallOccurred = false;
    const functionCallResults: string[] = [];
    let pendingFunctionCalls: { id: string; name: string; arguments: string }[] = [];
    let toolIterations = 0;
    const maxToolIterations = this.getMaxToolIterations();

    const sendEvent = (event: any) => {
      if (!event.event_id) {
        event.event_id = this.generateEventId();
      }

      const connection = this.persistentConnection;
      if (!connection) {
        throw new Error(
          `Cannot send Realtime event ${event.type}: persistent WebSocket is not set.`,
        );
      }
      // Defense-in-depth against the concurrency race: real ws sockets expose
      // readyState; the production code path goes through openPersistentConnection
      // which only resolves on OPEN, but if anything sneaks past (or the socket
      // closed after open), surface a clear error rather than letting the ws
      // module emit "WebSocket is not open: readyState 0". Mocked sockets in
      // unit tests omit readyState, so skip the check there.
      if (typeof connection.readyState === 'number' && connection.readyState !== WebSocket.OPEN) {
        throw new Error(
          `Cannot send Realtime event ${event.type}: WebSocket not OPEN ` +
            `(readyState=${connection.readyState}).`,
        );
      }
      connection.send(JSON.stringify(event));

      return event.event_id;
    };

    // Store cleanup function for message handler
    let cleanupMessageHandler: (() => void) | null = null;

    const resolveResponse = () => {
      // Clean up message handler if it exists
      if (cleanupMessageHandler) {
        cleanupMessageHandler();
      }

      clearRequestTimeout();

      // Leave responseText empty when no text and no audio. callApi() converts
      // the empty result into a ProviderResponse error rather than letting a
      // placeholder string pass for a successful turn.
      if (responseText.length === 0) {
        logger.debug('Empty Realtime response text — letting callApi() surface as error');
      }

      // Prepare final response with audio if available
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
          prompt: _usage?.input_tokens ?? _usage?.prompt_tokens ?? 0,
          completion: _usage?.output_tokens ?? _usage?.completion_tokens ?? 0,
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
        // When the model emitted function_calls but no handler ran (no
        // functionCallHandler configured), surface the names so the
        // empty-response error in callApi() tells the user *which* tools the
        // model tried to invoke.
        attemptedFunctionCalls:
          functionCallOccurred && functionCallResults.length === 0
            ? pendingFunctionCalls.map((c) => ({ name: c.name }))
            : undefined,
      });
    };

    const checkAndResolve = () => {
      // Only resolve after the server confirms the response is complete.
      if (responseDone && textDone && audioDone) {
        resolveResponse();
      } else {
        logger.info(
          `Waiting for completion - Response done: ${responseDone}, Text done: ${textDone}, Audio done: ${audioDone}`,
        );
      }
    };

    const messageHandler = async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        resetRequestTimeout();

        switch (message.type) {
          case 'conversation.item.created':
          case 'conversation.item.added':
          case 'conversation.item.done':
            if (message.item.role === 'user' && message.item.id !== _messageId) {
              _messageId = message.item.id;
              this.previousItemId = _messageId;

              // Send response creation event immediately after user message
              sendEvent({
                type: 'response.create',
                response: await this.getRealtimeResponseConfig(realtimeToolConfig),
              });
            } else if (message.item.role === 'assistant') {
              this.assistantMessageIds.push(message.item.id);
              this.previousItemId = message.item.id;
            }
            break;

          case 'response.created':
            _responseId = message.response.id;
            break;

          case 'response.text.delta':
          case 'response.output_text.delta':
          case 'response.audio_transcript.delta':
          case 'response.output_audio_transcript.delta':
            responseText += message.delta;
            break;

          case 'response.text.done':
          case 'response.output_text.done':
          case 'response.audio_transcript.done':
          case 'response.output_audio_transcript.done':
            textDone = true;
            if (message.text && message.text.length > 0) {
              responseText = message.text;
            }
            checkAndResolve();
            break;

          case 'response.audio.delta':
          case 'response.output_audio.delta':
            if (!this.isProcessingAudio) {
              this.isProcessingAudio = true;
              audioDone = false;
            }

            if (message.item_id !== this.lastAudioItemId) {
              this.lastAudioItemId = message.item_id;
              this.currentAudioBuffer = [];
            }

            const audioData = message.audio || message.delta;
            if (audioData && audioData.length > 0) {
              try {
                const audioBuffer = Buffer.from(audioData, 'base64');
                this.currentAudioBuffer.push(audioBuffer);
              } catch (error) {
                logger.error(`Error processing audio data: ${error}`);
              }
            }
            break;

          case 'response.audio.done':
          case 'response.output_audio.done':
            if (message.format) {
              this.currentAudioFormat = message.format;
            }
            this.isProcessingAudio = false;
            audioDone = true;
            checkAndResolve();
            break;

          case 'response.output_item.added':
            if (message.item.type === 'function_call') {
              functionCallOccurred = true;
              pendingFunctionCalls.push({
                id: message.item.call_id,
                name: message.item.name,
                arguments: message.item.arguments || '{}',
              });
            }
            break;

          case 'response.function_call_arguments.done': {
            const callIndex = pendingFunctionCalls.findIndex((call) => call.id === message.call_id);
            if (callIndex !== -1) {
              pendingFunctionCalls[callIndex].arguments = message.arguments;
            }
            break;
          }

          case 'response.done':
            responseDone = true;
            if (message.response?.usage || message.usage) {
              _usage = message.response?.usage ?? message.usage;
            }

            if (pendingFunctionCalls.length > 0 && this.config.functionCallHandler) {
              if (toolIterations >= maxToolIterations) {
                clearRequestTimeout();
                // Detach our message/error/close listeners — without this, the
                // shared persistent socket keeps invoking this stale handler
                // for every event on every subsequent turn, recreating the
                // event-interleaving bug this PR was meant to fix.
                if (cleanupMessageHandler) {
                  cleanupMessageHandler();
                }
                // The session still contains an unresolved function_call. Do
                // not reuse that contaminated socket for later maintainContext
                // turns; close it and force the next request to reconnect.
                const conn = this.persistentConnection;
                this.tearDownPersistentConnection('tool iteration cap reached');
                conn?.close();
                reject(
                  this.toolIterationCapError(maxToolIterations, {
                    functionCallOccurred,
                    functionCallResults: [...functionCallResults],
                  }),
                );
                return;
              }
              toolIterations++;
              // Pause the inactivity timeout while user code runs — handler
              // execution time is not WebSocket inactivity.
              clearRequestTimeout();
              const roundResults = await this.runToolCallRound(pendingFunctionCalls, sendEvent);
              functionCallResults.push(...roundResults);

              sendEvent({
                type: 'response.create',
              });
              resetRequestTimeout();
              responseText = '';
              responseError = '';
              textDone = false;
              audioDone = true;
              this.resetAudioState();
              pendingFunctionCalls = [];
              responseDone = false;
              return;
            }

            // If response.done arrives with no audio in flight, finish the turn.
            // Only force-mark textDone when no deltas were ever observed — when
            // we did see deltas, the explicit *.done event will (or already did)
            // arrive separately and chopping mid-stream would silently truncate
            // the transcript.
            if (!this.isProcessingAudio) {
              audioDone = true;
              if (!textDone && responseText.length === 0) {
                textDone = true;
              }
            }
            checkAndResolve();
            break;

          case 'error':
            responseError = message.error?.message || message.message || 'Unknown WebSocket error';
            logger.error(`WebSocket error: ${responseError}`);
            clearRequestTimeout();
            this.resetAudioState();
            // Detach our listeners on the shared socket; otherwise this stale
            // handler keeps firing for events from later turns.
            if (cleanupMessageHandler) {
              cleanupMessageHandler();
            }
            reject(new Error(responseError));
            break;
        }
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error}`);
        clearRequestTimeout();
        this.resetAudioState();
        // Detach our message/error/close listeners — the turn is failing and
        // we don't want a subsequent socket event to fire stale handlers
        // against an already-rejected promise (no harm functionally, but it
        // would re-trigger tearDown logic and produce confusing logs).
        if (cleanupMessageHandler) {
          cleanupMessageHandler();
        }
        reject(new Error(`Error processing WebSocket message: ${error}`));
      }
    };

    // Add message handler for this request
    if (this.persistentConnection) {
      const conn = this.persistentConnection;
      conn.on('message', messageHandler);
      const onSocketError = (error: Error) => {
        logger.error(`WebSocket error: ${error}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        if (this.persistentConnection === conn) {
          this.tearDownPersistentConnection(`socket error: ${error.message}`);
        }
        reject(error);
      };
      // Without a 'close' listener here, an unexpected disconnect mid-turn
      // would leave the caller's promise pending until the request timeout
      // fires; worse, connectionReady stays cached and subsequent turns
      // would skip reconnection.
      const onSocketClose = (code: number, reason: Buffer) => {
        const message = formatCloseMessage('Persistent WebSocket closed mid-turn', code, reason);
        logger.debug(message);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        if (this.persistentConnection === conn) {
          this.tearDownPersistentConnection(`socket close mid-turn: code=${code}`);
        }
        reject(new Error(message));
      };
      conn.once('error', onSocketError);
      conn.once('close', onSocketClose);

      cleanupMessageHandler = () => {
        conn.removeListener('message', messageHandler);
        conn.removeListener('error', onSocketError);
        conn.removeListener('close', onSocketClose);
      };
    }

    sendEvent({
      type: 'session.update',
      session: await this.getRealtimeSessionConfig(realtimeToolConfig),
    });

    // Create a conversation item with the user's prompt. Use the snapshot
    // taken before any await so a concurrent turn cannot mutate the anchor.
    sendEvent({
      type: 'conversation.item.create',
      previous_item_id: previousItemIdAtTurnStart,
      item: {
        type: 'message',
        role: 'user',
        content: promptContent,
      },
    });
  }

  // Add cleanup method to close WebSocket connections
  cleanup(): void {
    if (this.persistentConnection) {
      logger.info('Cleaning up persistent WebSocket connection');
      // Clear all timeouts
      this.activeTimeouts.forEach((t) => clearTimeout(t));
      this.activeTimeouts.clear();

      // Reset audio state
      this.resetAudioState();

      // Close connection and reset all cached lifecycle state in one place so
      // a re-used provider instance can open a fresh socket on the next turn.
      this.persistentConnection.close();
      this.tearDownPersistentConnection('cleanup() called');
      this.previousItemId = null;
      this.assistantMessageIds = [];
    }
  }
}
