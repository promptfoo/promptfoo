import axios from 'axios';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import WebSocket from 'ws';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import { validatePythonPath } from '../../python/pythonUtils';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
import { isJavascriptFile } from '../../util/fileExtensions';
import type { CompletionOptions, FunctionCall } from './types';
import type { GeminiFormat } from './util';
import { geminiFormatAndSystemInstructions, loadFile } from './util';

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
    return this.config.apiKey || getEnvString('GOOGLE_API_KEY');
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro

    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
    );
    let contentIndex = 0;

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

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${this.getApiKey()}`;

      const ws = new WebSocket(url);

      let response_text_total = '';
      let response_audio_total = '';
      let response_audio_transcript = '';
      let hasAudioContent = false;
      const function_calls_total: FunctionCall[] = [];
      let statefulApiState: any = undefined;

      const isTextExpected =
        this.config.generationConfig?.response_modalities?.includes('text') ?? false;
      const isAudioExpected =
        this.config.generationConfig?.response_modalities?.includes('audio') ?? false;

      let hasTextStreamEnded = !isTextExpected;
      let hasAudioStreamEnded = !isAudioExpected;

      // Extract transcription config for use in message handler
      const hasOutputTranscription = !!this.config.generationConfig?.outputAudioTranscription;
      const hasInputTranscription = !!this.config.generationConfig?.inputAudioTranscription;

      // Set a standard 30-second timeout for the WebSocket connection (like OpenAI)
      const timeout = setTimeout(() => {
        logger.error('WebSocket connection timed out after 30 seconds');
        ws.close();
        safeResolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 30000);

      const finalizeResponse = async () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        clearTimeout(timeout);

        // Retrieve final state from stateful API before shutting down
        if (this.config.functionToolStatefulApi) {
          try {
            const url = new URL('get_state', this.config.functionToolStatefulApi.url).href;
            const apiResponse = await axios.get(url);
            statefulApiState = apiResponse.data;
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
            ...(this.config.tools ? { tools: loadFile(this.config.tools, context?.vars) } : {}),
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
          const response = JSON.parse(responseText);

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
            const contentMessage = formatContentMessage(contents, contentIndex);
            contentIndex += 1;
            logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
            ws.send(JSON.stringify(contentMessage));
          } else if (
            response.serverContent?.outputTranscription?.text &&
            !response.serverContent?.modelTurn
          ) {
            // Handle transcription-only messages (when transcription comes separately)
            response_audio_transcript += response.serverContent.outputTranscription.text;
            clearTimeout(timeout);
          } else if (response.serverContent?.modelTurn?.parts) {
            for (const part of response.serverContent.modelTurn.parts) {
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
            if (response.serverContent.outputTranscription?.text) {
              // Append transcription text (it comes in chunks)
              response_audio_transcript += response.serverContent.outputTranscription.text;
              // Mark that we've received audio content when transcription arrives
              if (isAudioExpected) {
                hasAudioContent = true;
              }
            }
          } else if (response.serverContent?.generationComplete) {
            logger.debug(
              `Generation complete received - text expected: ${isTextExpected}, audio expected: ${isAudioExpected}, has transcription: ${hasOutputTranscription}`,
            );
            if (isTextExpected && !hasTextStreamEnded) {
              hasTextStreamEnded = true;
            }
            // When audio with transcription is expected, generation complete signals end of audio too
            if (isAudioExpected && !hasAudioStreamEnded && hasOutputTranscription) {
              hasAudioStreamEnded = true;
            }
            if (hasTextStreamEnded && hasAudioStreamEnded) {
              finalizeResponse().catch((err) => {
                logger.error(`Error in finalizeResponse: ${err}`);
                safeResolve({ error: `Error finalizing response: ${err}` });
              });
              return;
            }
          } else if (response.serverContent?.turnComplete && contentIndex >= contents.length) {
            logger.debug(
              `Turn complete received - text expected: ${isTextExpected}, text ended: ${hasTextStreamEnded}, audio expected: ${isAudioExpected}, audio ended: ${hasAudioStreamEnded}, has audio: ${hasAudioContent}, has transcription: ${!!response_audio_transcript}`,
            );
            if (isTextExpected && !hasTextStreamEnded) {
              hasTextStreamEnded = true;
            }
            if (isAudioExpected && !hasAudioStreamEnded) {
              // When transcription is enabled, we should complete immediately on turnComplete
              // as the audio and transcription are sent together
              if (hasOutputTranscription || hasInputTranscription) {
                hasAudioStreamEnded = true;
              } else if (hasAudioContent) {
                hasAudioStreamEnded = true;
              } else {
                hasAudioStreamEnded = true;
              }
            }
            if (hasTextStreamEnded && hasAudioStreamEnded) {
              finalizeResponse().catch((err) => {
                logger.error(`Error in finalizeResponse: ${err}`);
                safeResolve({ error: `Error finalizing response: ${err}` });
              });
              return;
            }
          } else if (response.serverContent?.turnComplete && contentIndex < contents.length) {
            const contentMessage = formatContentMessage(contents, contentIndex);
            contentIndex += 1;
            logger.debug(`WebSocket sent (multi-turn): ${JSON.stringify(contentMessage)}`);
            ws.send(JSON.stringify(contentMessage));
          } else if (response.toolCall?.functionCalls) {
            for (const functionCall of response.toolCall.functionCalls) {
              function_calls_total.push(functionCall);
              if (functionCall && functionCall.id && functionCall.name) {
                let callbackResponse = {};
                const functionName = functionCall.name;
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
                    const url = new URL(functionName, this.config.functionToolStatefulApi.url).href;
                    try {
                      // Try GET first, then fall back to POST
                      try {
                        const axiosResponse = await axios.get(url, {
                          params: functionCall.args || null,
                        });
                        callbackResponse = axiosResponse.data;
                      } catch {
                        const axiosResponse = await axios.post(url, functionCall.args || null);
                        callbackResponse = axiosResponse.data;
                      }
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
            }
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
              if (hasTextStreamEnded && hasAudioStreamEnded) {
                finalizeResponse().catch((err) => {
                  logger.error(`Error in finalizeResponse: ${err}`);
                  safeResolve({ error: `Error finalizing response: ${err}` });
                });
              }
            }
          }
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
