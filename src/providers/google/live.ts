import { type ChildProcess, spawn } from 'child_process';
import path from 'path';

import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import { validatePythonPath } from '../../python/pythonUtils';
import { fetchWithProxy } from '../../util/fetch/index';
import { parseFileUrl } from '../../util/functions/loadFunction';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { GOOGLE_MODELS } from './shared';
import {
  calculateGoogleCost,
  geminiFormatAndSystemInstructions,
  getGoogleAccessToken,
  loadCredentials,
  mergeGoogleCompletionOptions,
  normalizeTools,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
  stripExecutableToolFileReferences,
  validateFunctionCall,
} from './util';
import type WebSocket from 'ws';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/index';
import type { CompletionOptions, FunctionCall } from './types';
import type { GeminiFormat } from './util';

const formatContentMessages = (
  contents: GeminiFormat,
  contentIndex: number,
  useRealtimeTextInput = false,
) => {
  if (contents[contentIndex].role !== 'user') {
    throw new Error('Can only take user role inputs.');
  }
  const parts = contents[contentIndex].parts;

  if (useRealtimeTextInput) {
    const mappedMessages = parts.map((part) => {
      const userPart = part as {
        text?: string;
        inlineData?: { mimeType: string; data: string };
        inline_data?: { mime_type: string; data: string };
      };
      if (userPart.text !== undefined) {
        return { realtime_input: { text: userPart.text } };
      }
      const inlineData = userPart.inlineData ?? userPart.inline_data;
      if (inlineData) {
        const mimeType = 'mimeType' in inlineData ? inlineData.mimeType : inlineData.mime_type;
        if (mimeType.startsWith('video/')) {
          throw new Error(
            'Google Live video input must be sent as individual image/jpeg or image/png frames (maximum 1 frame per second).',
          );
        }
        if (
          !mimeType.startsWith('audio/') &&
          mimeType !== 'image/jpeg' &&
          mimeType !== 'image/png'
        ) {
          throw new Error(`Unsupported Google Live realtime input MIME type: ${mimeType}`);
        }
        const mediaType = mimeType.startsWith('audio/') ? 'audio' : 'video';
        return {
          realtime_input: {
            [mediaType]: { mime_type: mimeType, data: inlineData.data },
          },
        };
      }
      throw new Error('Unsupported part in Google Live realtime input.');
    });
    const textMessages = mappedMessages.filter((message) => 'text' in message.realtime_input);
    const contentMessages = mappedMessages.filter((message) => !('text' in message.realtime_input));
    if (contentMessages.some((message) => 'audio' in message.realtime_input)) {
      contentMessages.push({ realtime_input: { audio_stream_end: true } } as any);
    } else if (
      contentMessages.some((message) => 'video' in message.realtime_input) &&
      textMessages.length === 0
    ) {
      contentMessages.push({ client_content: { turn_complete: true } } as any);
    }
    if (textMessages.length > 0) {
      contentMessages.push({
        realtime_input: {
          text: textMessages.map((message) => message.realtime_input.text).join('\n'),
        },
      } as any);
    }
    return contentMessages;
  }

  if (parts.length !== 1) {
    throw new Error('Unexpected number of parts in user input.');
  }
  const userMessage = parts[0].text;

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
  return [contentMessage];
};

const getModalityTokenCount = (details: unknown, modality: string): number => {
  if (!Array.isArray(details)) {
    return 0;
  }
  return details.reduce((total, detail) => {
    const count = detail?.tokenCount ?? detail?.token_count;
    return detail?.modality === modality && typeof count === 'number' && Number.isFinite(count)
      ? total + Math.max(count, 0)
      : total;
  }, 0);
};

const getTokenCount = (...values: unknown[]): number => {
  const value = values.find((entry) => typeof entry === 'number' && Number.isFinite(entry));
  return typeof value === 'number' ? Math.max(value, 0) : 0;
};

/**
 * Helper function to fetch JSON with error handling
 */
export const fetchJson = async <T = unknown>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetchWithProxy(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error - status: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

/**
 * Helper function to try GET with query params, fallback to POST with JSON body
 */
export const tryGetThenPost = async <T = unknown>(url: string, data?: unknown): Promise<T> => {
  try {
    // Try GET first with query params
    const urlWithParams = new URL(url);
    if (data) {
      const params = (typeof data === 'string' ? JSON.parse(data) : data) as Record<
        string,
        unknown
      >;
      Object.entries(params).forEach(([key, value]) => {
        urlWithParams.searchParams.append(key, String(value));
      });
    }
    return await fetchJson<T>(urlWithParams.href);
  } catch {
    // Fall back to POST
    return fetchJson<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(typeof data === 'string' ? JSON.parse(data) : data) : null,
    });
  }
};

export class GoogleLiveProvider implements ApiProvider {
  config: CompletionOptions;
  modelName: string;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(modelName: string, options: ProviderOptions) {
    this.modelName = modelName;
    this.config = options.config || {};
  }

  validateFunctionToolCall(output: string | object, vars?: CallApiContextParams['vars']): void {
    validateFunctionCall(output, this.config.tools, vars);
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

    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );
    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );
    let contentIndex = 0;

    let statefulApi: ChildProcess | undefined;
    if (!toolsDisabled && config.functionToolStatefulApi?.file) {
      try {
        // Use the validatePythonPath function to get the correct Python executable
        const pythonPath = await validatePythonPath(
          config.functionToolStatefulApi.pythonExecutable ||
            getEnvString('PROMPTFOO_PYTHON') ||
            'python3',
          !!config.functionToolStatefulApi.pythonExecutable || !!getEnvString('PROMPTFOO_PYTHON'),
        );
        logger.debug(`Spawning API with Python executable: ${pythonPath}`);
        statefulApi = spawn(pythonPath, [config.functionToolStatefulApi.file]);

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

    // Load tools before creating WebSocket Promise. Disabled mode removes executable
    // Python/JS tool refs before loading so non-function tools stay available without
    // executing user code.
    const configTools = toolsDisabled
      ? stripExecutableToolFileReferences(config.tools, context?.vars)
      : config.tools;
    const fileTools = configTools
      ? await maybeLoadToolsFromExternalFile(configTools, context?.vars)
      : [];
    const normalizedTools = Array.isArray(fileTools)
      ? normalizeTools(fileTools)
      : fileTools
        ? [fileTools]
        : [];
    const requestTools = toolsDisabled
      ? removeGoogleFunctionDeclarations(normalizedTools)
      : normalizedTools;

    // Lazy-load the `ws` implementation so merely importing this module stays cheap;
    // the Live provider is itself dynamically imported by the Google provider family.
    const WebSocketCtor = (await import('ws')).default;

    return new Promise<ProviderResponse>((resolve) => {
      const isNativeAudioModel = this.modelName.includes('native-audio');
      const usesRealtimeTextInput = this.modelName.startsWith('gemini-3.1-flash-live');
      let isResolved = false;

      const safeResolve = (response: ProviderResponse) => {
        if (!isResolved) {
          isResolved = true;
          resolve(response);
        }
      };

      let { apiVersion } = config;
      if (!apiVersion) {
        apiVersion = usesRealtimeTextInput ? 'v1beta' : 'v1alpha';
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

      const ws = new WebSocketCtor(url);

      let response_text_total = '';
      let response_audio_total = '';
      let response_audio_transcript = '';
      let hasAudioContent = false;
      const function_calls_total: FunctionCall[] = [];
      let statefulApiState: unknown = undefined;
      const usageMetadata: any[] = [];
      let pendingUsageMetadata: any;
      let completedGenerations = 0;
      let completedTurns = 0;
      let lastVideoFrameSentAt = 0;
      let hasFinalized = false;

      const configuredResponseModalities = config.generationConfig?.response_modalities?.map(
        (modality) => modality.toUpperCase(),
      );
      const requestedText = configuredResponseModalities?.includes('TEXT') ?? false;
      const responseModalities = usesRealtimeTextInput
        ? configuredResponseModalities?.filter((modality) => modality !== 'TEXT')
        : configuredResponseModalities;
      const effectiveResponseModalities =
        usesRealtimeTextInput && !responseModalities?.length ? ['AUDIO'] : responseModalities;
      const isTextExpected = effectiveResponseModalities?.includes('TEXT') ?? false;
      const isAudioExpected = effectiveResponseModalities?.includes('AUDIO') ?? false;

      let hasTextStreamEnded = !isTextExpected;
      let hasAudioStreamEnded = !isAudioExpected;

      const sendContentMessages = async (contentMessages: any[]) => {
        for (const contentMessage of contentMessages) {
          if (contentMessage.realtime_input?.video) {
            const delayMs = Math.max(lastVideoFrameSentAt + 1_000 - Date.now(), 0);
            if (delayMs > 0) {
              await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
            }
            if (isResolved) {
              return;
            }
            lastVideoFrameSentAt = Date.now();
          }
          ws.send(JSON.stringify(contentMessage));
        }
      };

      // Extract transcription config for use in message handler
      const hasOutputTranscription =
        !!config.generationConfig?.outputAudioTranscription ||
        (usesRealtimeTextInput && requestedText);

      const videoFrameCount = contents.reduce(
        (total, content) =>
          total +
          content.parts.filter((part) => {
            const inlineData =
              (part as { inlineData?: { mimeType?: string; mime_type?: string } }).inlineData ??
              (part as { inline_data?: { mimeType?: string; mime_type?: string } }).inline_data;
            const mimeType = inlineData?.mimeType ?? inlineData?.mime_type;
            return mimeType === 'image/jpeg' || mimeType === 'image/png';
          }).length,
        0,
      );
      const framePacingAllowanceMs = Math.max(videoFrameCount - 1, 0) * 1_000;

      // Preserve the response timeout after all rate-limited video frames have been sent.
      const timeout = setTimeout(
        () => {
          logger.error('WebSocket connection timed out after 30 seconds');
          ws.close();
          safeResolve({ error: 'WebSocket request timed out' });
        },
        (config.timeoutMs || 30000) + framePacingAllowanceMs,
      );

      const finalizeResponse = async () => {
        // Prevent multiple calls to finalizeResponse
        if (hasFinalized) {
          logger.debug('finalizeResponse already called, skipping duplicate call');
          return;
        }
        hasFinalized = true;

        if (ws.readyState === WebSocketCtor.OPEN) {
          ws.close();
        }
        clearTimeout(timeout);

        // Retrieve final state from stateful API before shutting down. Skip
        // if the request has already been resolved (e.g. by an early
        // onclose/timeout) — the caller has moved on and won't read the
        // result.
        if (!isResolved && !toolsDisabled && config.functionToolStatefulApi) {
          try {
            const url = new URL('get_state', config.functionToolStatefulApi.url).href;
            statefulApiState = await fetchJson(url);
            logger.debug(`Stateful api state: ${JSON.stringify(statefulApiState)}`);
          } catch (err) {
            logger.error(`Error retrieving final state of api: ${JSON.stringify(err)}`);
          }
        }

        if (statefulApi) {
          statefulApi.kill();
        }

        // Determine final output text and thinking
        let outputText = response_text_total;
        let thinking = undefined;

        // If we have audio content with transcript
        if (hasAudioContent && response_audio_transcript) {
          if (response_text_total) {
            // Separate thinking from main output
            thinking = response_text_total;
            outputText = response_audio_transcript;
          } else {
            // Use transcript as the primary output text
            outputText = response_audio_transcript;
          }
        }

        const result: ProviderResponse = {
          output: {
            text: outputText,
            toolCall: { functionCalls: function_calls_total },
            statefulApiState,
            ...(thinking && { thinking }),
          },
          metadata: {},
        };

        if (usageMetadata.length > 0) {
          const promptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getTokenCount(usage.promptTokenCount, usage.prompt_token_count) +
              getTokenCount(usage.toolUsePromptTokenCount, usage.tool_use_prompt_token_count),
            0,
          );
          const responseTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getTokenCount(
                usage.responseTokenCount,
                usage.candidatesTokenCount,
                usage.response_token_count,
                usage.candidates_token_count,
              ),
            0,
          );
          const thoughtTokens = usageMetadata.reduce(
            (total, usage) =>
              total + getTokenCount(usage.thoughtsTokenCount, usage.thoughts_token_count),
            0,
          );
          const billableCompletionTokens = usageMetadata.reduce((total, usage) => {
            const promptTokenCount = getTokenCount(
              usage.promptTokenCount,
              usage.prompt_token_count,
            );
            const toolUsePromptTokenCount = getTokenCount(
              usage.toolUsePromptTokenCount,
              usage.tool_use_prompt_token_count,
            );
            const responseTokenCount = getTokenCount(
              usage.responseTokenCount,
              usage.candidatesTokenCount,
              usage.response_token_count,
              usage.candidates_token_count,
            );
            const totalTokenCount = getTokenCount(usage.totalTokenCount, usage.total_token_count);
            const thoughtsTokenCount = getTokenCount(
              usage.thoughtsTokenCount,
              usage.thoughts_token_count,
            );
            const thoughtsIncluded =
              totalTokenCount > 0 &&
              (totalTokenCount === promptTokenCount + responseTokenCount ||
                totalTokenCount ===
                  promptTokenCount + toolUsePromptTokenCount + responseTokenCount);

            return total + responseTokenCount + (thoughtsIncluded ? 0 : thoughtsTokenCount);
          }, 0);
          const audioPromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.promptTokensDetails ?? usage.prompt_tokens_details,
                'AUDIO',
              ) +
              getModalityTokenCount(
                usage.toolUsePromptTokensDetails ?? usage.tool_use_prompt_tokens_details,
                'AUDIO',
              ),
            0,
          );
          const audioCompletionTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.responseTokensDetails ??
                  usage.candidatesTokensDetails ??
                  usage.response_tokens_details ??
                  usage.candidates_tokens_details,
                'AUDIO',
              ),
            0,
          );
          const imagePromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.promptTokensDetails ?? usage.prompt_tokens_details,
                'IMAGE',
              ) +
              getModalityTokenCount(
                usage.toolUsePromptTokensDetails ?? usage.tool_use_prompt_tokens_details,
                'IMAGE',
              ) +
              getModalityTokenCount(
                usage.promptTokensDetails ?? usage.prompt_tokens_details,
                'DOCUMENT',
              ) +
              getModalityTokenCount(
                usage.toolUsePromptTokensDetails ?? usage.tool_use_prompt_tokens_details,
                'DOCUMENT',
              ),
            0,
          );
          const videoPromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.promptTokensDetails ?? usage.prompt_tokens_details,
                'VIDEO',
              ) +
              getModalityTokenCount(
                usage.toolUsePromptTokensDetails ?? usage.tool_use_prompt_tokens_details,
                'VIDEO',
              ),
            0,
          );
          const cachedPromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getTokenCount(usage.cachedContentTokenCount, usage.cached_content_token_count),
            0,
          );
          const cachedAudioPromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.cacheTokensDetails ?? usage.cache_tokens_details,
                'AUDIO',
              ),
            0,
          );
          const cachedImagePromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.cacheTokensDetails ?? usage.cache_tokens_details,
                'IMAGE',
              ) +
              getModalityTokenCount(
                usage.cacheTokensDetails ?? usage.cache_tokens_details,
                'DOCUMENT',
              ),
            0,
          );
          const cachedVideoPromptTokens = usageMetadata.reduce(
            (total, usage) =>
              total +
              getModalityTokenCount(
                usage.cacheTokensDetails ?? usage.cache_tokens_details,
                'VIDEO',
              ),
            0,
          );
          const videoInputPerSecond = GOOGLE_MODELS.find((model) => model.id === this.modelName)
            ?.cost?.videoInputPerSecond;
          const billVideoPerSecond = videoFrameCount > 0 && videoInputPerSecond !== undefined;

          result.tokenUsage = {
            prompt: promptTokens,
            completion: responseTokens,
            total: usageMetadata.reduce(
              (total, usage) =>
                total + getTokenCount(usage.totalTokenCount, usage.total_token_count),
              0,
            ),
            numRequests: usageMetadata.length,
            ...(cachedPromptTokens > 0 ? { cached: cachedPromptTokens } : {}),
            ...(thoughtTokens > 0 ? { completionDetails: { reasoning: thoughtTokens } } : {}),
          };
          const tokenCost = calculateGoogleCost(
            this.modelName,
            config,
            Math.max(promptTokens - (billVideoPerSecond ? videoPromptTokens : 0), 0),
            billableCompletionTokens,
            false,
            audioPromptTokens,
            audioCompletionTokens,
            undefined,
            imagePromptTokens + (billVideoPerSecond ? 0 : videoPromptTokens),
            Math.max(cachedPromptTokens - (billVideoPerSecond ? cachedVideoPromptTokens : 0), 0),
            cachedAudioPromptTokens,
            cachedImagePromptTokens + (billVideoPerSecond ? 0 : cachedVideoPromptTokens),
          );
          result.cost =
            tokenCost === undefined
              ? undefined
              : tokenCost + (billVideoPerSecond ? videoFrameCount * videoInputPerSecond : 0);
        }

        if (hasAudioContent) {
          result.audio = {
            data: this.convertPcmToWav(response_audio_total),
            format: 'wav',
            transcript: response_audio_transcript || response_text_total || undefined,
          };
        }
        safeResolve(result);
      };

      ws.onopen = () => {
        logger.debug('WebSocket connection is opening...');
        const {
          speechConfig,
          outputAudioTranscription: configuredOutputAudioTranscription,
          inputAudioTranscription,
          enableAffectiveDialog,
          proactivity,
          ...restGenerationConfig
        } = config.generationConfig || {};
        const outputAudioTranscription =
          configuredOutputAudioTranscription ??
          (usesRealtimeTextInput && requestedText ? {} : undefined);

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
              context: config.context,
              examples: config.examples,
              stopSequences: config.stopSequences,
              temperature: config.temperature,
              maxOutputTokens: config.maxOutputTokens,
              topP: config.topP,
              topK: config.topK,
              ...restGenerationConfig,
              ...(effectiveResponseModalities
                ? { response_modalities: effectiveResponseModalities }
                : {}),
              ...(formattedSpeechConfig ? { speech_config: formattedSpeechConfig } : {}),
              ...(enableAffectiveDialog ? { enable_affective_dialog: enableAffectiveDialog } : {}),
              ...(formattedProactivity ? { proactivity: formattedProactivity } : {}),
            },
            ...(toolConfig ? { toolConfig } : {}),
            ...(requestTools.length > 0 ? { tools: requestTools } : {}),
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
        // Once the request has been resolved (e.g. by an early onclose or
        // timeout), drop any in-flight messages so they don't trigger side
        // effects like stateful-API fetches after the caller has moved on.
        if (isResolved) {
          return;
        }
        // Handle different data types from WebSocket
        logger.debug('WebSocket message received');
        let responseData: string;
        if (event.data instanceof ArrayBuffer || event.data instanceof Buffer) {
          const dataString = event.data.toString('utf-8');

          try {
            JSON.parse(dataString);
            responseData = dataString;
          } catch {
            hasAudioContent = true;
            const audioBuffer = Buffer.isBuffer(event.data) ? event.data : Buffer.from(event.data);
            response_audio_total += audioBuffer.toString('base64');
            clearTimeout(timeout);
            if (isAudioExpected) {
              hasAudioStreamEnded = false;
            }
            return;
          }
        } else if (typeof event.data === 'string') {
          responseData = event.data;
        } else {
          logger.warn(`Unexpected event.data type: ${typeof event.data}`);
          ws.close();
          safeResolve({ error: 'Unexpected response data format' });
          return;
        }

        try {
          const responseText = await new Response(responseData).text();
          // Re-check after the await: the request may have been resolved by an
          // onclose/timeout while we were parsing.
          if (isResolved) {
            return;
          }
          const response = JSON.parse(responseText);

          const frameUsageMetadata = response.usageMetadata ?? response.usage_metadata;
          if (frameUsageMetadata) {
            pendingUsageMetadata = frameUsageMetadata;
          }
          if ((response.serverContent?.turnComplete || response.toolCall) && pendingUsageMetadata) {
            usageMetadata.push(pendingUsageMetadata);
            pendingUsageMetadata = undefined;
          }

          if (response.error) {
            logger.error(`Google Live API error: ${JSON.stringify(response.error)}`);
            ws.close();
            safeResolve({ error: `Google Live API error: ${JSON.stringify(response.error)}` });
            return;
          }

          const messageType = response.setupComplete
            ? 'setupComplete'
            : response.serverContent?.modelTurn
              ? 'modelTurn'
              : response.serverContent?.generationComplete
                ? 'generationComplete'
                : response.serverContent?.turnComplete
                  ? 'turnComplete'
                  : response.toolCall
                    ? 'toolCall'
                    : response.streamingCustomOp
                      ? 'streamingCustomOp'
                      : 'unknown';
          logger.debug(
            `Message type: ${messageType}, hasAudioContent: ${hasAudioContent}, hasOutputTranscription: ${hasOutputTranscription}`,
          );

          if (response.setupComplete) {
            const contentMessages = formatContentMessages(
              contents,
              contentIndex,
              usesRealtimeTextInput,
            );
            contentIndex += 1;
            logger.debug(`WebSocket sent: ${JSON.stringify(contentMessages)}`);
            await sendContentMessages(contentMessages);
          } else if (response.serverContent) {
            const { serverContent } = response;

            if (serverContent.modelTurn?.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.text) {
                  response_text_total += part.text;
                  clearTimeout(timeout);
                }
                if (part.inlineData?.mimeType?.includes('audio')) {
                  hasAudioContent = true;
                  response_audio_total += part.inlineData.data;
                  clearTimeout(timeout);
                  if (isAudioExpected) {
                    hasAudioStreamEnded = false;
                  }
                }
              }
              if (serverContent.outputTranscription?.text) {
                response_audio_transcript += serverContent.outputTranscription.text;
                if (isAudioExpected) {
                  hasAudioContent = true;
                }
                clearTimeout(timeout);
              }
            } else if (serverContent.outputTranscription?.text) {
              // Handle transcription-only messages when transcription arrives separately.
              response_audio_transcript += serverContent.outputTranscription.text;
              if (isAudioExpected) {
                hasAudioContent = true;
              }
              clearTimeout(timeout);
            }

            if (serverContent.generationComplete) {
              completedGenerations += 1;
              logger.debug(
                `Generation complete received - text expected: ${isTextExpected}, audio expected: ${isAudioExpected}, has transcription: ${hasOutputTranscription}`,
              );
              if (isTextExpected && !hasTextStreamEnded) {
                hasTextStreamEnded = true;
              }
              if (isAudioExpected && !hasAudioStreamEnded && hasOutputTranscription) {
                hasAudioStreamEnded = true;
              }
            }

            if (serverContent.turnComplete && contentIndex < contents.length) {
              completedTurns += 1;
              const contentMessages = formatContentMessages(
                contents,
                contentIndex,
                usesRealtimeTextInput,
              );
              contentIndex += 1;
              logger.debug(`WebSocket sent (multi-turn): ${JSON.stringify(contentMessages)}`);
              hasTextStreamEnded = !isTextExpected;
              hasAudioStreamEnded = !isAudioExpected;
              await sendContentMessages(contentMessages);
              return;
            }

            if (serverContent.turnComplete && contentIndex >= contents.length) {
              completedTurns += 1;
              logger.debug(
                `Turn complete received - text expected: ${isTextExpected}, text ended: ${hasTextStreamEnded}, audio expected: ${isAudioExpected}, audio ended: ${hasAudioStreamEnded}, has audio: ${hasAudioContent}, has transcription: ${!!response_audio_transcript}`,
              );
              if (isTextExpected && !hasTextStreamEnded) {
                hasTextStreamEnded = true;
              }
              if (isAudioExpected && !hasAudioStreamEnded) {
                hasAudioStreamEnded = true;
              }
            }

            if (
              serverContent.turnComplete &&
              Math.max(completedGenerations, completedTurns) >= contents.length &&
              hasTextStreamEnded &&
              hasAudioStreamEnded &&
              contentIndex >= contents.length
            ) {
              try {
                await finalizeResponse();
              } catch (err) {
                logger.error(`Error in finalizeResponse: ${err}`);
                safeResolve({ error: `Error finalizing response: ${err}` });
              }
            }
            return;
          } else if (response.toolCall?.functionCalls) {
            // Skip tool execution and tool_response sends if the request is
            // already resolved (e.g. via timeout/onclose).
            if (isResolved) {
              return;
            }
            if (toolsDisabled) {
              // Reply with an error tool_response so the model can complete its turn
              // instead of waiting for a response that will never come (which would
              // otherwise stall the websocket until the 30s timeoutMs fires).
              logger.warn('Ignoring function calls received while tools are disabled.');
              for (const functionCall of response.toolCall.functionCalls) {
                if (functionCall?.id && functionCall.name) {
                  const toolMessage = {
                    toolResponse: {
                      functionResponses: [
                        {
                          id: functionCall.id,
                          name: functionCall.name,
                          response: { error: 'Tool calls are disabled for this request.' },
                        },
                      ],
                    },
                  };
                  ws.send(JSON.stringify(toolMessage));
                }
              }
            } else {
              for (const functionCall of response.toolCall.functionCalls) {
                function_calls_total.push(functionCall);
                if (functionCall && functionCall.id && functionCall.name) {
                  let callbackResponse: unknown = {};
                  const functionName = functionCall.name;
                  try {
                    if (config.functionToolCallbacks?.[functionName]) {
                      callbackResponse = await this.executeFunctionCallback(
                        functionName,
                        JSON.stringify(
                          typeof functionCall.args === 'string'
                            ? JSON.parse(functionCall.args)
                            : functionCall.args,
                        ),
                        config.functionToolCallbacks,
                      );
                    } else if (config.functionToolStatefulApi) {
                      logger.warn(
                        'functionToolStatefulApi configured but no HTTP client implemented for it after cleanup.',
                      );
                      const baseUrl = new URL(functionName, config.functionToolStatefulApi.url)
                        .href;
                      try {
                        callbackResponse = await tryGetThenPost(baseUrl, functionCall.args);
                        logger.debug(`Stateful api response: ${JSON.stringify(callbackResponse)}`);
                      } catch (err) {
                        callbackResponse = {
                          error: `Error executing function ${functionName}: ${JSON.stringify(err)}`,
                        };
                        logger.error(
                          `Error executing function ${functionName}: ${JSON.stringify(err)}`,
                        );
                      }
                    }
                  } catch (err) {
                    callbackResponse = {
                      error: `Error executing function ${functionName}: ${JSON.stringify(err)}`,
                    };
                    logger.error(
                      `Error executing function ${functionName}: ${JSON.stringify(err)}`,
                    );
                  }
                  // The callback above may have awaited; bail before sending
                  // a tool_response if the request has since been resolved.
                  if (isResolved) {
                    return;
                  }
                  const toolMessage = {
                    toolResponse: {
                      functionResponses: [
                        {
                          id: functionCall.id,
                          name: functionName,
                          response: callbackResponse,
                        },
                      ],
                    },
                  };
                  logger.debug(`WebSocket sent: ${JSON.stringify(toolMessage)}`);
                  ws.send(JSON.stringify(toolMessage));
                }
              }
            }
          } else if (response.sessionResumptionUpdate) {
            logger.debug(
              `Session resumption update received: ${JSON.stringify(response.sessionResumptionUpdate)}`,
            );
          } else if (response.realtimeInput?.mediaChunks) {
            for (const chunk of response.realtimeInput.mediaChunks) {
              if (chunk.mimeType?.includes('audio')) {
                hasAudioContent = true;
                response_audio_total += chunk.data;
              }
            }
          } else if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData?.mimeType?.includes('audio')) {
                hasAudioContent = true;
                response_audio_total += part.inlineData.data;
              }
            }
          } else if (
            response.streamingCustomOp?.[
              'type.googleapis.com/google.ai.generativelanguage.v1alpha.StreamingCustomOpOutput'
            ]?.audioCompletionSignal
          ) {
            hasAudioStreamEnded = true;
          } else if (
            !response.setupComplete &&
            !response.serverContent &&
            !response.toolCall &&
            !response.realtimeInput &&
            !response.candidates &&
            !response.streamingCustomOp
          ) {
            logger.warn(
              `Received unhandled WebSocket message structure: ${JSON.stringify(response).substring(0, 200)}`,
            );
            if (
              hasOutputTranscription &&
              hasAudioContent &&
              isAudioExpected &&
              !hasAudioStreamEnded
            ) {
              logger.debug(
                'Unknown message with transcription enabled - marking audio as complete',
              );
              hasAudioStreamEnded = true;
              if (hasTextStreamEnded) {
                try {
                  await finalizeResponse();
                } catch (err) {
                  logger.error(`Error in finalizeResponse: ${err}`);
                  safeResolve({ error: `Error finalizing response: ${err}` });
                }
              }
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to process WebSocket response: ${message}`);
          ws.close();
          safeResolve({ error: `Failed to process WebSocket response: ${message}` });
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
    const { filePath, functionName } = parseFileUrl(fileRef);

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
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    callbacks = this.config.functionToolCallbacks,
  ): Promise<any> {
    try {
      const shouldUseSharedCache = callbacks === this.config.functionToolCallbacks;
      // Check if we've already loaded this function
      let callback = shouldUseSharedCache ? this.loadedFunctionCallbacks[functionName] : undefined;

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = callbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          if (shouldUseSharedCache && callback) {
            this.loadedFunctionCallbacks[functionName] = callback;
          }
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          if (shouldUseSharedCache) {
            this.loadedFunctionCallbacks[functionName] = callback;
          }
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
