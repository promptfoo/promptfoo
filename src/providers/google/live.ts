import { type ChildProcess, spawn } from 'child_process';
import path from 'path';

import WebSocket from 'ws';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import { validatePythonPath } from '../../python/pythonUtils';
import { fetchWithProxy } from '../../util/fetch/index';
import { isJavascriptFile } from '../../util/fileExtensions';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import {
  geminiFormatAndSystemInstructions,
  getGoogleAccessToken,
  loadCredentials,
  normalizeTools,
} from './util';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions, FunctionCall } from './types';
import type { GeminiFormat } from './util';

const formatContentMessage = (contents: GeminiFormat, contentIndex: number) => {
  if (contents[contentIndex].role != 'user') {
    throw new Error('Can only take user role inputs.');
  }
  if (contents[contentIndex].parts.length != 1) {
    throw new Error('Unexpected number of parts in user input.');
  }
  const userMessage = contents[contentIndex].parts[0].text;

  const contentMessage = {
    client_content: {
      turns: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      turn_complete: true,
    },
  };
  return contentMessage;
};

/**
 * Helper function to fetch JSON with error handling
 */
export const fetchJson = async (url: string, options?: RequestInit): Promise<any> => {
  const response = await fetchWithProxy(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error - status: ${response.status}`);
  }
  return response.json();
};

/**
 * Helper function to try GET with query params, fallback to POST with JSON body
 */
export const tryGetThenPost = async (url: string, data?: any): Promise<any> => {
  try {
    // Try GET first with query params
    const urlWithParams = new URL(url);
    if (data) {
      const params = typeof data === 'string' ? JSON.parse(data) : data;
      Object.entries(params).forEach(([key, value]) => {
        urlWithParams.searchParams.append(key, String(value));
      });
    }
    return await fetchJson(urlWithParams.href);
  } catch {
    // Fall back to POST
    return fetchJson(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(typeof data === 'string' ? JSON.parse(data) : data) : null,
    });
  }
};

/**
 * Mutable session state for a single Google Live API WebSocket connection.
 */
interface LiveSessionState {
  response_text_total: string;
  response_audio_total: string;
  response_audio_transcript: string;
  hasAudioContent: boolean;
  function_calls_total: FunctionCall[];
  statefulApiState: any;
  hasFinalized: boolean;
  hasTextStreamEnded: boolean;
  hasAudioStreamEnded: boolean;
  contentIndex: number;
  isTextExpected: boolean;
  isAudioExpected: boolean;
  hasOutputTranscription: boolean;
}

export class GoogleLiveProvider implements ApiProvider {
  config: CompletionOptions;
  modelName: string;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(modelName: string, options: ProviderOptions) {
    this.modelName = modelName;
    this.config = options.config || {};
  }

  id(): string {
    return `google:live:${this.modelName}`;
  }

  toString(): string {
    return `[Google Live Provider ${this.modelName}]`;
  }

  private convertPcmToWav(base64PcmData: string): string {
    const pcmBuffer = Buffer.from(base64PcmData, 'base64');
    const wavBuffer = this.createWavHeader(pcmBuffer.length, 24000, 16, 1);
    const wavData = Buffer.concat([wavBuffer, pcmBuffer]);
    return wavData.toString('base64');
  }

  private createWavHeader(
    dataLength: number,
    sampleRate: number,
    bitsPerSample: number,
    channels: number,
  ): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
    header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    return header;
  }

  getApiKey(): string | undefined {
    // Priority aligned with Python SDK: GOOGLE_API_KEY > GEMINI_API_KEY
    return this.config.apiKey || getEnvString('GOOGLE_API_KEY') || getEnvString('GEMINI_API_KEY');
  }

  /**
   * Gets an OAuth2 access token from Google credentials for the Generative Language API.
   * Returns undefined if credentials are not available or if there's an error.
   *
   * Supports authentication via:
   * - Service account JSON (via config.credentials or GOOGLE_APPLICATION_CREDENTIALS)
   * - Application Default Credentials (via `gcloud auth application-default login`)
   */
  private async getAccessToken(): Promise<string | undefined> {
    const credentials = loadCredentials(this.config.credentials);
    return getGoogleAccessToken(credentials);
  }

  /**
   * Process modelTurn parts from a serverContent message, mutating session state.
   */
  private processModelTurnParts(
    state: LiveSessionState,
    serverContent: any,
    timeout: ReturnType<typeof setTimeout>,
  ): void {
    for (const part of serverContent.modelTurn.parts) {
      if (part.text) {
        state.response_text_total += part.text;
        clearTimeout(timeout);
      }
      if (part.inlineData?.mimeType?.includes('audio')) {
        state.hasAudioContent = true;
        state.response_audio_total += part.inlineData.data;
        clearTimeout(timeout);
        if (state.isAudioExpected) {
          state.hasAudioStreamEnded = false;
        }
      }
    }
    if (serverContent.outputTranscription?.text) {
      state.response_audio_transcript += serverContent.outputTranscription.text;
      if (state.isAudioExpected) {
        state.hasAudioContent = true;
      }
    }
  }

  /**
   * Execute a single function call and send the tool response over WebSocket.
   */
  private async executeSingleFunctionCall(functionCall: any, ws: WebSocket): Promise<void> {
    if (!functionCall?.id || !functionCall?.name) {
      return;
    }
    const functionName = functionCall.name;
    let callbackResponse = {};
    try {
      if (this.config.functionToolCallbacks?.[functionName]) {
        callbackResponse = await this.executeFunctionCallback(
          functionName,
          JSON.stringify(
            typeof functionCall.args === 'string'
              ? JSON.parse(functionCall.args)
              : functionCall.args,
          ),
        );
      } else if (this.config.functionToolStatefulApi) {
        logger.warn(
          'functionToolStatefulApi configured but no HTTP client implemented for it after cleanup.',
        );
        const baseUrl = new URL(functionName, this.config.functionToolStatefulApi.url).href;
        try {
          callbackResponse = await tryGetThenPost(baseUrl, functionCall.args);
          logger.debug(`Stateful api response: ${JSON.stringify(callbackResponse)}`);
        } catch (err) {
          callbackResponse = {
            error: `Error executing function ${functionName}: ${JSON.stringify(err)}`,
          };
          logger.error(`Error executing function ${functionName}: ${JSON.stringify(err)}`);
        }
      }
    } catch (err) {
      callbackResponse = {
        error: `Error executing function ${functionName}: ${JSON.stringify(err)}`,
      };
      logger.error(`Error executing function ${functionName}: ${JSON.stringify(err)}`);
    }
    const toolMessage = {
      tool_response: {
        function_responses: {
          id: functionCall.id,
          name: functionName,
          response: callbackResponse,
        },
      },
    };
    logger.debug(`WebSocket sent: ${JSON.stringify(toolMessage)}`);
    ws.send(JSON.stringify(toolMessage));
  }

  /**
   * Build the final ProviderResponse from session state.
   */
  private buildFinalResponse(state: LiveSessionState): ProviderResponse {
    let outputText = state.response_text_total;
    let thinking: string | undefined;

    if (state.hasAudioContent && state.response_audio_transcript) {
      if (state.response_text_total) {
        thinking = state.response_text_total;
        outputText = state.response_audio_transcript;
      } else {
        outputText = state.response_audio_transcript;
      }
    }

    const result: ProviderResponse = {
      output: {
        text: outputText,
        toolCall: { functionCalls: state.function_calls_total },
        statefulApiState: state.statefulApiState,
        ...(thinking && { thinking }),
      },
      metadata: {},
    };

    if (state.hasAudioContent) {
      result.audio = {
        data: this.convertPcmToWav(state.response_audio_total),
        format: 'wav',
        transcript: state.response_audio_transcript || state.response_text_total || undefined,
      };
    }

    return result;
  }

  /**
   * Finalize the WebSocket session: close connection, fetch final state, resolve promise.
   */
  private async finalizeWebSocketSession(
    state: LiveSessionState,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<void> {
    if (state.hasFinalized) {
      logger.debug('finalizeResponse already called, skipping duplicate call');
      return;
    }
    state.hasFinalized = true;

    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    clearTimeout(timeout);

    if (this.config.functionToolStatefulApi) {
      try {
        const stateUrl = new URL('get_state', this.config.functionToolStatefulApi.url).href;
        state.statefulApiState = await fetchJson(stateUrl);
        logger.debug(`Stateful api state: ${JSON.stringify(state.statefulApiState)}`);
      } catch (err) {
        logger.error(`Error retrieving final state of api: ${JSON.stringify(err)}`);
      }
    }

    if (statefulApi) {
      statefulApi.kill();
    }

    safeResolve(this.buildFinalResponse(state));
  }

  /**
   * Finalize if both streams have ended. Returns true if finalized.
   */
  private async tryFinalizeIfComplete(
    state: LiveSessionState,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<boolean> {
    if (!state.hasTextStreamEnded || !state.hasAudioStreamEnded) {
      return false;
    }
    try {
      await this.finalizeWebSocketSession(state, ws, timeout, statefulApi, safeResolve);
    } catch (err) {
      logger.error(`Error in finalizeResponse: ${err}`);
      safeResolve({ error: `Error finalizing response: ${err}` });
    }
    return true;
  }

  /**
   * Handle generationComplete message type.
   */
  private async handleGenerationComplete(
    state: LiveSessionState,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<boolean> {
    logger.debug(
      `Generation complete received - text expected: ${state.isTextExpected}, audio expected: ${state.isAudioExpected}, has transcription: ${state.hasOutputTranscription}`,
    );
    if (state.isTextExpected && !state.hasTextStreamEnded) {
      state.hasTextStreamEnded = true;
    }
    if (state.isAudioExpected && !state.hasAudioStreamEnded && state.hasOutputTranscription) {
      state.hasAudioStreamEnded = true;
    }
    return this.tryFinalizeIfComplete(state, ws, timeout, statefulApi, safeResolve);
  }

  /**
   * Handle turnComplete message type.
   */
  private async handleTurnComplete(
    state: LiveSessionState,
    contents: GeminiFormat,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<boolean> {
    if (state.contentIndex < contents.length) {
      // Multi-turn: send next content message
      const contentMessage = formatContentMessage(contents, state.contentIndex);
      state.contentIndex += 1;
      logger.debug(`WebSocket sent (multi-turn): ${JSON.stringify(contentMessage)}`);
      ws.send(JSON.stringify(contentMessage));
      return false;
    }

    logger.debug(
      `Turn complete received - text expected: ${state.isTextExpected}, text ended: ${state.hasTextStreamEnded}, audio expected: ${state.isAudioExpected}, audio ended: ${state.hasAudioStreamEnded}, has audio: ${state.hasAudioContent}, has transcription: ${!!state.response_audio_transcript}`,
    );
    if (state.isTextExpected && !state.hasTextStreamEnded) {
      state.hasTextStreamEnded = true;
    }
    if (state.isAudioExpected && !state.hasAudioStreamEnded) {
      state.hasAudioStreamEnded = true;
    }
    return this.tryFinalizeIfComplete(state, ws, timeout, statefulApi, safeResolve);
  }

  /**
   * Handle an unknown/unrecognized message structure.
   */
  private async handleUnknownMessage(
    response: any,
    state: LiveSessionState,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<boolean> {
    logger.warn(
      `Received unhandled WebSocket message structure: ${JSON.stringify(response).substring(0, 200)}`,
    );
    if (
      state.hasOutputTranscription &&
      state.hasAudioContent &&
      state.isAudioExpected &&
      !state.hasAudioStreamEnded
    ) {
      logger.debug('Unknown message with transcription enabled - marking audio as complete');
      state.hasAudioStreamEnded = true;
      return this.tryFinalizeIfComplete(state, ws, timeout, statefulApi, safeResolve);
    }
    return false;
  }

  /**
   * Parse raw WebSocket event.data to a JSON string.
   * Returns null if the data was raw binary audio (state updated) or unrecognized type.
   */
  private parseWebSocketEventData(
    event: WebSocket.MessageEvent,
    state: LiveSessionState,
    timeout: ReturnType<typeof setTimeout>,
    ws: WebSocket,
    safeResolve: (response: ProviderResponse) => void,
  ): string | null {
    if (event.data instanceof ArrayBuffer || event.data instanceof Buffer) {
      const dataString = (event.data as Buffer).toString('utf-8');
      try {
        JSON.parse(dataString);
        return dataString;
      } catch {
        // Binary data that is not JSON - treat as raw audio
        state.hasAudioContent = true;
        const audioBuffer = Buffer.isBuffer(event.data)
          ? event.data
          : Buffer.from(event.data as ArrayBuffer);
        state.response_audio_total += audioBuffer.toString('base64');
        clearTimeout(timeout);
        if (state.isAudioExpected) {
          state.hasAudioStreamEnded = false;
        }
        return null;
      }
    }
    if (typeof event.data === 'string') {
      return event.data;
    }
    logger.warn(`Unexpected event.data type: ${typeof event.data}`);
    ws.close();
    safeResolve({ error: 'Unexpected response data format' });
    return null;
  }

  /**
   * Determine the message type label for logging.
   */
  private getMessageType(response: any): string {
    if (response.setupComplete) {
      return 'setupComplete';
    }
    if (response.serverContent?.modelTurn) {
      return 'modelTurn';
    }
    if (response.serverContent?.generationComplete) {
      return 'generationComplete';
    }
    if (response.serverContent?.turnComplete) {
      return 'turnComplete';
    }
    if (response.toolCall) {
      return 'toolCall';
    }
    if (response.streamingCustomOp) {
      return 'streamingCustomOp';
    }
    return 'unknown';
  }

  /**
   * Process and dispatch a parsed WebSocket JSON response.
   * Returns false if the session should continue, true if finalized.
   */
  private async processAndDispatch(
    response: any,
    state: LiveSessionState,
    contents: GeminiFormat,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<void> {
    if (response.error) {
      logger.error(`Google Live API error: ${JSON.stringify(response.error)}`);
      ws.close();
      safeResolve({ error: `Google Live API error: ${JSON.stringify(response.error)}` });
      return;
    }

    const messageType = this.getMessageType(response);
    logger.debug(
      `Message type: ${messageType}, hasAudioContent: ${state.hasAudioContent}, hasOutputTranscription: ${state.hasOutputTranscription}`,
    );

    await this.dispatchWebSocketMessage(
      response,
      state,
      contents,
      ws,
      timeout,
      statefulApi,
      safeResolve,
    );
  }

  /**
   * Dispatch a WebSocket message to the appropriate handler based on its content.
   */
  private async dispatchWebSocketMessage(
    response: any,
    state: LiveSessionState,
    contents: GeminiFormat,
    ws: WebSocket,
    timeout: ReturnType<typeof setTimeout>,
    statefulApi: ChildProcess | undefined,
    safeResolve: (response: ProviderResponse) => void,
  ): Promise<void> {
    if (response.setupComplete) {
      const contentMessage = formatContentMessage(contents, state.contentIndex);
      state.contentIndex += 1;
      logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
      ws.send(JSON.stringify(contentMessage));
      return;
    }

    if (response.serverContent?.outputTranscription?.text && !response.serverContent?.modelTurn) {
      state.response_audio_transcript += response.serverContent.outputTranscription.text;
      clearTimeout(timeout);
      return;
    }

    if (response.serverContent?.modelTurn?.parts) {
      this.processModelTurnParts(state, response.serverContent, timeout);
      return;
    }

    if (response.serverContent?.generationComplete) {
      await this.handleGenerationComplete(state, ws, timeout, statefulApi, safeResolve);
      return;
    }

    if (response.serverContent?.turnComplete) {
      await this.handleTurnComplete(state, contents, ws, timeout, statefulApi, safeResolve);
      return;
    }

    if (response.toolCall?.functionCalls) {
      for (const functionCall of response.toolCall.functionCalls) {
        state.function_calls_total.push(functionCall);
        await this.executeSingleFunctionCall(functionCall, ws);
      }
      return;
    }

    if (response.realtimeInput?.mediaChunks) {
      for (const chunk of response.realtimeInput.mediaChunks) {
        if (chunk.mimeType?.includes('audio')) {
          state.hasAudioContent = true;
          state.response_audio_total += chunk.data;
        }
      }
      return;
    }

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.includes('audio')) {
          state.hasAudioContent = true;
          state.response_audio_total += part.inlineData.data;
        }
      }
      return;
    }

    const streamingCustomOpKey =
      'type.googleapis.com/google.ai.generativelanguage.v1alpha.StreamingCustomOpOutput';
    if (response.streamingCustomOp?.[streamingCustomOpKey]?.audioCompletionSignal) {
      state.hasAudioStreamEnded = true;
      return;
    }

    const isKnownField =
      response.setupComplete ||
      response.serverContent ||
      response.toolCall ||
      response.realtimeInput ||
      response.candidates ||
      response.streamingCustomOp;

    if (!isKnownField) {
      await this.handleUnknownMessage(response, state, ws, timeout, statefulApi, safeResolve);
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro

    // Try OAuth2 first (required for WebSocket Live API - API keys are not supported)
    // Fall back to API key only if OAuth2 is not available
    const accessToken = await this.getAccessToken();
    const apiKey = this.getApiKey();

    if (!accessToken && !apiKey) {
      throw new Error(
        'Google authentication is not configured. The Live API requires OAuth2 authentication.\n\n' +
          'Either:\n' +
          '1. Set up Application Default Credentials:\n' +
          '   gcloud auth application-default login --client-id-file=client_secret.json ' +
          '--scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/generative-language.retriever"\n' +
          '2. Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file, or\n' +
          '3. Add `credentials` to the provider config with service account JSON\n\n' +
          'Note: GOOGLE_API_KEY is NOT supported for the Live API WebSocket endpoint.\n' +
          'For OAuth2 setup instructions, see: https://ai.google.dev/gemini-api/docs/oauth\n' +
          'These options require the google-auth-library package to be installed.',
      );
    }

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
      { useAssistantRole: this.config.useAssistantRole },
    );

    let statefulApi: ChildProcess | undefined;
    if (this.config.functionToolStatefulApi?.file) {
      try {
        // Use the validatePythonPath function to get the correct Python executable
        const pythonPath = await validatePythonPath(
          this.config.functionToolStatefulApi.pythonExecutable ||
            getEnvString('PROMPTFOO_PYTHON') ||
            'python3',
          !!this.config.functionToolStatefulApi.pythonExecutable ||
            !!getEnvString('PROMPTFOO_PYTHON'),
        );
        logger.debug(`Spawning API with Python executable: ${pythonPath}`);
        statefulApi = spawn(pythonPath, [this.config.functionToolStatefulApi.file]);

        // Add error handling for the Python process
        statefulApi.on('error', (err) => {
          logger.error(`Error spawning Python process: ${JSON.stringify(err)}`);
        });

        // Log output from the Python process for debugging
        statefulApi.stdout?.on('data', (data) => {
          logger.debug(`Python API stdout: ${data.toString()}`);
        });
        statefulApi.stderr?.on('data', (data) => {
          logger.error(`Python API stderr: ${data.toString()}`);
        });

        // Give the Python API time to start up
        await new Promise((resolve) => setTimeout(resolve, 1000));
        logger.debug('Stateful API process started');
      } catch (err) {
        logger.error(`Failed to spawn Python API: ${JSON.stringify(err)}`);
      }
    }

    // Load tools before creating WebSocket Promise
    const fileTools = this.config.tools
      ? await maybeLoadToolsFromExternalFile(this.config.tools, context?.vars)
      : [];
    const normalizedTools = Array.isArray(fileTools)
      ? normalizeTools(fileTools)
      : fileTools
        ? [fileTools]
        : [];

    return new Promise<ProviderResponse>((resolve) => {
      const isNativeAudioModel = this.modelName.includes('native-audio');
      let isResolved = false;

      const safeResolve = (response: ProviderResponse) => {
        if (!isResolved) {
          isResolved = true;
          resolve(response);
        }
      };

      let { apiVersion } = this.config;
      if (!apiVersion) {
        apiVersion = 'v1alpha';
      }

      // Construct WebSocket URL with OAuth2 token (required) or API key (fallback, likely won't work)
      let url: string;
      if (accessToken) {
        url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?access_token=${accessToken}`;
        logger.debug('Using OAuth2 access token for Google Live API authentication');
      } else {
        // Note: API keys are likely to be rejected by the Live API WebSocket endpoint
        url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
        logger.debug('Using API key for Google Live API authentication (may not be supported)');
      }

      const ws = new WebSocket(url);

      const isTextExpected =
        this.config.generationConfig?.response_modalities?.includes('text') ?? false;
      const isAudioExpected =
        this.config.generationConfig?.response_modalities?.includes('audio') ?? false;

      const state: LiveSessionState = {
        response_text_total: '',
        response_audio_total: '',
        response_audio_transcript: '',
        hasAudioContent: false,
        function_calls_total: [],
        statefulApiState: undefined,
        hasFinalized: false,
        hasTextStreamEnded: !isTextExpected,
        hasAudioStreamEnded: !isAudioExpected,
        contentIndex: 0,
        isTextExpected,
        isAudioExpected,
        hasOutputTranscription: !!this.config.generationConfig?.outputAudioTranscription,
      };

      // Set a standard 30-second timeout for the WebSocket connection (like OpenAI)
      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        safeResolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 30000);

      ws.onopen = () => {
        logger.debug('WebSocket connection is opening...');
        const {
          speechConfig,
          outputAudioTranscription,
          inputAudioTranscription,
          enableAffectiveDialog,
          proactivity,
          ...restGenerationConfig
        } = this.config.generationConfig || {};

        let formattedSpeechConfig;
        if (speechConfig) {
          formattedSpeechConfig = {
            ...(speechConfig.voiceConfig && {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: speechConfig.voiceConfig.prebuiltVoiceConfig?.voiceName,
                },
              },
            }),
            ...(speechConfig.languageCode && { language_code: speechConfig.languageCode }),
          };
        }

        let formattedProactivity;
        if (proactivity) {
          formattedProactivity = {
            proactive_audio: proactivity.proactiveAudio,
          };
        }

        const setupMessage = {
          setup: {
            model: `models/${this.modelName}`,
            generation_config: {
              context: this.config.context,
              examples: this.config.examples,
              stopSequences: this.config.stopSequences,
              temperature: this.config.temperature,
              maxOutputTokens: this.config.maxOutputTokens,
              topP: this.config.topP,
              topK: this.config.topK,
              ...restGenerationConfig,
              ...(formattedSpeechConfig ? { speech_config: formattedSpeechConfig } : {}),
              ...(enableAffectiveDialog ? { enable_affective_dialog: enableAffectiveDialog } : {}),
              ...(formattedProactivity ? { proactivity: formattedProactivity } : {}),
            },
            ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
            ...(normalizedTools.length > 0 ? { tools: normalizedTools } : {}),
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(outputAudioTranscription
              ? { output_audio_transcription: outputAudioTranscription }
              : {}),
            ...(inputAudioTranscription
              ? { input_audio_transcription: inputAudioTranscription }
              : {}),
          },
        };

        logger.debug(`Sending setup message: ${JSON.stringify(setupMessage, null, 2)}`);
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        logger.debug('WebSocket message received');

        const responseData = this.parseWebSocketEventData(event, state, timeout, ws, safeResolve);
        if (responseData === null) {
          return;
        }

        try {
          const responseText = await new Response(responseData).text();
          const response = JSON.parse(responseText);
          await this.processAndDispatch(
            response,
            state,
            contents,
            ws,
            timeout,
            statefulApi,
            safeResolve,
          );
        } catch (err) {
          logger.error(`Failed to process WebSocket response: ${JSON.stringify(err)}`);
          ws.close();
          safeResolve({ error: `Failed to process WebSocket response: ${JSON.stringify(err)}` });
        }
      };

      ws.onerror = (err) => {
        logger.error(`WebSocket error for model ${this.modelName}: ${JSON.stringify(err)}`);
        if (isNativeAudioModel) {
          logger.error(
            `Native audio model ${this.modelName} may not be available or may require different configuration`,
          );
        }
        clearTimeout(timeout);
        ws.close();
        safeResolve({
          error: `WebSocket error for model ${this.modelName}: ${JSON.stringify(err)}`,
        });
      };

      ws.onclose = (event: WebSocket.CloseEvent) => {
        logger.debug(
          `WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`,
        );
        if (statefulApi && !statefulApi.killed) {
          statefulApi.kill('SIGTERM');
        }
        clearTimeout(timeout);
        // If the promise hasn't been resolved yet and the closure was unexpected, resolve with error.
        // This is a fallback; most paths should resolve the promise earlier.
        if (!isResolved) {
          safeResolve({
            error: `WebSocket connection closed unexpectedly. Code: ${event.code}, Reason: ${event.reason}`,
          });
        }
      };
    });
  }

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(functionName: string, args: string): Promise<any> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = this.config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      return result;
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error; // Re-throw so caller can handle fallback behavior
    }
  }
}
