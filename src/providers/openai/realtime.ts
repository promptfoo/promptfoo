import WebSocket from 'ws';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util';
import { OpenAiGenericProvider } from '.';
import { OPENAI_REALTIME_MODELS } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  TokenUsage,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { OpenAiCompletionOptions } from './types';

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
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';
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

  getRealtimeSessionBody() {
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
      body.tools = maybeLoadToolsFromExternalFile(this.config.tools);
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

  async webSocketRequest(clientSecret: string, prompt: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      logger.debug(
        `Attempting to connect to OpenAI WebSocket with client secret: ${clientSecret.slice(0, 5)}...`,
      );

      // The WebSocket URL needs to include the client secret
      const wsUrl = `wss://api.openai.com/v1/realtime/socket?client_secret=${encodeURIComponent(clientSecret)}`;
      logger.debug(`Connecting to WebSocket URL: ${wsUrl.slice(0, 60)}...`);

      // Add WebSocket options to bypass potential network issues
      const wsOptions = {
        headers: {
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: 'https://api.openai.com',
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      // Set a timeout for the WebSocket connection
      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, this.config.websocketTimeout || 30000); // Default 30 second timeout

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

      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      ws.on('open', () => {
        logger.debug('WebSocket connection established successfully');

        // Create a conversation item with the user's prompt - immediately after connection
        // Don't send ping event as it's not supported
        sendEvent({
          type: 'conversation.item.create',
          previous_item_id: null,
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
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
                  content: [
                    {
                      type: 'input_text',
                      text: prompt,
                    },
                  ],
                },
              });
              break;

            case 'session.created':
              logger.debug('Session created on WebSocket');
              // No need to do anything here as we'll wait for session.ready
              break;

            case 'conversation.item.created':
              if (message.item.role === 'user') {
                // User message was created, now create a response
                messageId = message.item.id;

                // Prepare response creation event with appropriate settings
                const responseEvent: any = {
                  type: 'response.create',
                  response: {
                    modalities: this.config.modalities || ['text', 'audio'],
                    instructions: this.config.instructions || 'You are a helpful assistant.',
                    voice: this.config.voice || 'alloy',
                    temperature: this.config.temperature ?? 0.8,
                  },
                };

                // Add tools if configured
                if (this.config.tools && this.config.tools.length > 0) {
                  responseEvent.response.tools = maybeLoadToolsFromExternalFile(this.config.tools);
                  if (Object.prototype.hasOwnProperty.call(this.config, 'tool_choice')) {
                    responseEvent.response.tool_choice = this.config.tool_choice;
                  } else {
                    responseEvent.response.tool_choice = 'auto';
                  }
                }

                sendEvent(responseEvent);
              }
              break;

            case 'response.created':
              responseId = message.response.id;
              break;

            case 'response.text.delta':
              // Accumulate text deltas
              responseText += message.delta;
              logger.debug(
                `Added text delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.text.done':
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
              // Accumulate audio transcript deltas - this is the text content
              responseText += message.delta;
              logger.debug(
                `Added audio transcript delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.audio_transcript.done':
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
              // Handle audio data (could store in metadata for playback if needed)
              logger.debug('Received audio data chunk');
              if (message.audio && message.audio.length > 0) {
                // Store the audio data for later use
                try {
                  const audioBuffer = Buffer.from(message.audio, 'base64');
                  audioContent.push(audioBuffer);
                  hasAudioContent = true;
                } catch (error) {
                  logger.error(`Error processing audio data: ${error}`);
                }
              }
              break;

            case 'response.audio.done':
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
                for (const call of pendingFunctionCalls) {
                  try {
                    // Execute the function handler
                    const result = await this.config.functionCallHandler(call.name, call.arguments);
                    functionCallResults.push(result);

                    // Send the function call result back to the model
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
                    // Send an error result back to the model
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

                // Request a new response from the model using the function results
                sendEvent({
                  type: 'response.create',
                });

                // Reset pending function calls - we've handled them
                pendingFunctionCalls = [];

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

                // If still empty, add a placeholder message to indicate the issue
                if (responseText.length === 0) {
                  responseText = '[No response received from API]';
                  logger.debug('Using placeholder message for empty response');
                }
              }

              ws.close();

              // Prepare audio data if available
              const finalAudioData = hasAudioContent
                ? Buffer.concat(audioContent).toString('base64')
                : null;

              resolve({
                output: responseText,
                tokenUsage: {
                  total: usage?.total_tokens || 0,
                  prompt: usage?.input_tokens || 0,
                  completion: usage?.output_tokens || 0,
                  cached: 0,
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
                    },
                  }),
                },
                functionCallOccurred,
                functionCallResults:
                  functionCallResults.length > 0 ? functionCallResults : undefined,
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
    callApiOptions?: CallApiOptionsParams,
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
      // Extract the message content for WebSocket communications
      let promptText = prompt;

      try {
        // Check if the prompt is a JSON string
        const parsedPrompt = JSON.parse(prompt);

        // Handle array format (OpenAI chat format)
        if (Array.isArray(parsedPrompt) && parsedPrompt.length > 0) {
          // Find the last user message (following OpenAI's chat convention)
          for (let i = parsedPrompt.length - 1; i >= 0; i--) {
            const message = parsedPrompt[i];
            if (message.role === 'user') {
              // Handle both simple content string and array of content objects
              if (typeof message.content === 'string') {
                promptText = message.content;
                break;
              } else if (Array.isArray(message.content) && message.content.length > 0) {
                // Find the first text content - check for both 'text' and 'input_text' for backward compatibility
                const textContent = message.content.find(
                  (content: any) =>
                    (content.type === 'text' || content.type === 'input_text') &&
                    typeof content.text === 'string',
                );
                if (textContent) {
                  promptText = textContent.text;
                  break;
                }
              }
            }
          }
        } else if (parsedPrompt && typeof parsedPrompt === 'object' && parsedPrompt.prompt) {
          // Handle {prompt: "..."} format that some templates might use
          promptText = parsedPrompt.prompt;
        }
      } catch {
        // Not JSON or couldn't extract - use as is
        logger.debug('Using prompt as is - not a JSON structure');
      }

      // Use a persistent connection if we should maintain conversation context
      let result;
      if (this.config.maintainContext === true) {
        result = await this.persistentWebSocketRequest(promptText);
      } else {
        // Connect directly to the WebSocket API using API key
        logger.debug(`Connecting directly to OpenAI Realtime API WebSocket with API key`);
        result = await this.directWebSocketRequest(promptText);
      }

      // Format the output - if function calls occurred, include that info
      let finalOutput = result.output;

      // Log the output we received for debugging
      logger.debug(`Final output from API: "${finalOutput}" (length: ${finalOutput.length})`);

      if (finalOutput.length === 0) {
        // Log at debug level instead of warn to prevent user-visible warnings
        logger.debug(
          'Received empty response from Realtime API - possible issue with transcript accumulation. Check modalities configuration.',
        );

        // Set a fallback message to help users, but keep it shorter
        finalOutput = '[No response received from API]';
      }

      if (
        result.functionCallOccurred &&
        result.functionCallResults &&
        result.functionCallResults.length > 0
      ) {
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
      }

      return {
        output: finalOutput,
        tokenUsage: result.tokenUsage,
        cached: result.cached,
        metadata,
        // Add audio at top level if available (EvalOutputCell expects this)
        ...(result.metadata?.audio && {
          audio: {
            data: result.metadata.audio.data,
            format: result.metadata.audio.format,
            transcript: result.output, // Use the text output as transcript
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

      // Construct URL with model parameter
      const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.modelName)}`;
      logger.debug(`Connecting to WebSocket URL: ${wsUrl}`);

      // Add WebSocket options with required headers
      const wsOptions = {
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          'OpenAI-Beta': 'realtime=v1',
          'User-Agent': 'promptfoo Realtime API Client',
          Origin: 'https://api.openai.com',
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      const ws = new WebSocket(wsUrl, wsOptions);

      // Set a timeout for the WebSocket connection
      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        reject(new Error('WebSocket connection timed out'));
      }, this.config.websocketTimeout || 30000);

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

      const sendEvent = (event: any) => {
        if (!event.event_id) {
          event.event_id = this.generateEventId();
        }
        logger.debug(`Sending event: ${JSON.stringify(event)}`);
        ws.send(JSON.stringify(event));
        return event.event_id;
      };

      ws.on('open', () => {
        logger.debug('WebSocket connection established successfully');

        // Create a conversation item with the user's prompt - immediately after connection
        // Don't send ping event as it's not supported
        sendEvent({
          type: 'conversation.item.create',
          previous_item_id: null,
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
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
            case 'session.created':
              logger.debug('Session created on WebSocket');
              break;

            case 'conversation.item.created':
              if (message.item.role === 'user') {
                // User message was created, now create a response
                messageId = message.item.id;

                // Prepare response creation event with appropriate settings
                const responseEvent: any = {
                  type: 'response.create',
                  response: {
                    modalities: this.config.modalities || ['text', 'audio'],
                    instructions: this.config.instructions || 'You are a helpful assistant.',
                    voice: this.config.voice || 'alloy',
                    temperature: this.config.temperature ?? 0.8,
                  },
                };

                // Add tools if configured
                if (this.config.tools && this.config.tools.length > 0) {
                  responseEvent.response.tools = maybeLoadToolsFromExternalFile(this.config.tools);
                  if (Object.prototype.hasOwnProperty.call(this.config, 'tool_choice')) {
                    responseEvent.response.tool_choice = this.config.tool_choice;
                  } else {
                    responseEvent.response.tool_choice = 'auto';
                  }
                }

                sendEvent(responseEvent);
              }
              break;

            case 'response.created':
              responseId = message.response.id;
              break;

            case 'response.text.delta':
              // Accumulate text deltas
              responseText += message.delta;
              logger.debug(
                `Added text delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.text.done':
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
              // Accumulate audio transcript deltas - this is the text content
              responseText += message.delta;
              logger.debug(
                `Added audio transcript delta: "${message.delta}", current length: ${responseText.length}`,
              );
              break;

            case 'response.audio_transcript.done':
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
              // Handle audio data (could store in metadata for playback if needed)
              logger.debug('Received audio data chunk');
              if (message.audio && message.audio.length > 0) {
                // Store the audio data for later use
                try {
                  const audioBuffer = Buffer.from(message.audio, 'base64');
                  audioContent.push(audioBuffer);
                  hasAudioContent = true;
                } catch (error) {
                  logger.error(`Error processing audio data: ${error}`);
                }
              }
              break;

            case 'response.audio.done':
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
                for (const call of pendingFunctionCalls) {
                  try {
                    // Execute the function handler
                    const result = await this.config.functionCallHandler(call.name, call.arguments);
                    functionCallResults.push(result);

                    // Send the function call result back to the model
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
                    // Send an error result back to the model
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

                // Request a new response from the model using the function results
                sendEvent({
                  type: 'response.create',
                });

                // Reset pending function calls - we've handled them
                pendingFunctionCalls = [];

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

                // If still empty, add a placeholder message to indicate the issue
                if (responseText.length === 0) {
                  responseText = '[No response received from API]';
                  logger.debug('Using placeholder message for empty response');
                }
              }

              ws.close();

              // Prepare audio data if available
              const finalAudioData = hasAudioContent
                ? Buffer.concat(audioContent).toString('base64')
                : null;

              resolve({
                output: responseText,
                tokenUsage: {
                  total: usage?.total_tokens || 0,
                  prompt: usage?.input_tokens || 0,
                  completion: usage?.output_tokens || 0,
                  cached: 0,
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
                    },
                  }),
                },
                functionCallOccurred,
                functionCallResults:
                  functionCallResults.length > 0 ? functionCallResults : undefined,
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

  // New method for persistent connection
  async persistentWebSocketRequest(prompt: string): Promise<RealtimeResponse> {
    return new Promise((resolve, reject) => {
      logger.debug(`Using persistent WebSocket connection to OpenAI Realtime API`);

      // Create a new connection if needed or use existing
      const connection = this.persistentConnection;

      if (connection) {
        // Connection already exists, just set up message handlers
        this.setupMessageHandlers(prompt, resolve, reject);
      } else {
        // Create new connection
        const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.modelName)}`;
        logger.debug(`Connecting to WebSocket URL: ${wsUrl}`);

        // Add WebSocket options with required headers
        const wsOptions = {
          headers: {
            Authorization: `Bearer ${this.getApiKey()}`,
            'OpenAI-Beta': 'realtime=v1',
            'User-Agent': 'promptfoo Realtime API Client',
            Origin: 'https://api.openai.com',
          },
          handshakeTimeout: 10000,
          perMessageDeflate: false,
        };

        this.persistentConnection = new WebSocket(wsUrl, wsOptions);

        // Handle connection establishment
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

    // Set main request timeout
    const requestTimeout = setTimeout(() => {
      logger.error('WebSocket response timed out');
      this.resetAudioState();
      reject(new Error('WebSocket response timed out'));
    }, this.config.websocketTimeout || 30000); // 30 second default timeout

    // Accumulators for response text and errors
    let responseText = '';
    let responseError = '';
    let textDone = false;
    let audioDone = true; // Default to true, set to false when audio processing starts
    let _usage: {
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    } | null = null;

    // Track message IDs and function call state
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

    // Store cleanup function for message handler
    let cleanupMessageHandler: (() => void) | null = null;

    const resolveResponse = () => {
      // Clean up message handler if it exists
      if (cleanupMessageHandler) {
        cleanupMessageHandler();
      }

      clearTimeout(requestTimeout);

      // Handle empty response cases
      if (responseText.length === 0) {
        logger.warn('Empty response text detected');
        if (this.currentAudioBuffer.length > 0) {
          responseText = '[Audio response received]';
        } else {
          responseText = '[No response received from API]';
        }
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
          prompt: _usage?.prompt_tokens || 0,
          completion: _usage?.completion_tokens || 0,
          cached: 0,
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
      // Only resolve if both text and audio are done (or no audio was processed)
      if (textDone && audioDone) {
        resolveResponse();
      } else {
        logger.info(`Waiting for completion - Text done: ${textDone}, Audio done: ${audioDone}`);
      }
    };

    const messageHandler = async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;

        switch (message.type) {
          case 'conversation.item.created':
            if (message.item.role === 'user') {
              _messageId = message.item.id;
              this.previousItemId = _messageId;

              // Send response creation event immediately after user message
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
            _responseId = message.response.id;
            break;

          case 'response.text.delta':
          case 'response.audio_transcript.delta':
            responseText += message.delta;
            clearTimeout(requestTimeout);
            break;

          case 'response.text.done':
          case 'response.audio_transcript.done':
            textDone = true;
            if (message.text && message.text.length > 0) {
              responseText = message.text;
            }
            checkAndResolve();
            break;

          case 'response.audio.delta':
            if (!this.isProcessingAudio) {
              this.isProcessingAudio = true;
              audioDone = false;
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
            audioDone = true;
            checkAndResolve();
            break;

          case 'response.done':
            if (message.usage) {
              _usage = message.usage;
            }
            // Mark both as done if we get response.done without any audio processing
            if (!this.isProcessingAudio) {
              audioDone = true;
              textDone = true;
            }
            checkAndResolve();
            break;

          case 'error':
            responseError = message.message || 'Unknown WebSocket error';
            logger.error(`WebSocket error: ${responseError}`);
            clearTimeout(requestTimeout);
            this.resetAudioState();
            reject(new Error(responseError));
            break;
        }
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        reject(new Error(`Error processing WebSocket message: ${error}`));
      }
    };

    // Add message handler for this request
    if (this.persistentConnection) {
      this.persistentConnection.on('message', messageHandler);
      this.persistentConnection.once('error', (error: Error) => {
        logger.error(`WebSocket error: ${error}`);
        clearTimeout(requestTimeout);
        this.resetAudioState();
        this.persistentConnection = null;
        reject(error);
      });

      // Set up cleanup function
      cleanupMessageHandler = () => {
        if (this.persistentConnection) {
          this.persistentConnection.removeListener('message', messageHandler);
        }
      };
    }

    // Create a conversation item with the user's prompt
    sendEvent({
      type: 'conversation.item.create',
      previous_item_id: this.previousItemId,
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
        ],
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

      // Close connection and reset state
      this.persistentConnection.close();
      this.persistentConnection = null;
      this.previousItemId = null;
      this.assistantMessageIds = [];
    }
  }
}
