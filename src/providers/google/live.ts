import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { validatePythonPath } from '../../python/pythonUtils';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
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

  constructor(modelName: string, options: ProviderOptions) {
    this.config = options.config as CompletionOptions;
    this.modelName = modelName;
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
      } catch (err) {
        logger.error(`Failed to spawn Python API: ${JSON.stringify(err)}`);
      }
    }

    return new Promise<ProviderResponse>((resolve) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.getApiKey()}`;
      const ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        logger.error('WebSocket request timed out');
        ws.close();
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 10000);

      let response_text_total = '';
      let response_audio_total = '';
      let hasAudioContent = false;
      const function_calls_total: FunctionCall[] = [];
      let audioCompletionTimer: NodeJS.Timeout | null = null;

      const isTextExpected = this.config.generationConfig?.response_modalities?.includes('text') ?? false;
      const isAudioExpected = this.config.generationConfig?.response_modalities?.includes('audio') ?? false;

      let hasTextStreamEnded = !isTextExpected;
      let hasAudioStreamEnded = !isAudioExpected;

      const finalizeResponse = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        clearTimeout(timeout);
        if (audioCompletionTimer) {
          clearTimeout(audioCompletionTimer);
        }
        if (statefulApi) {
          statefulApi.kill();
        }

        const result: ProviderResponse = {
          output: response_text_total,
          metadata: {
            raw: response_text_total,
            ...(function_calls_total.length > 0 && { function_calls: function_calls_total }),
            ...(hasAudioContent && {
              audio: {
                data: this.convertPcmToWav(response_audio_total),
                format: 'wav',
              },
            }),
          },
        };

        if (hasAudioContent) {
          result.audio = {
            data: this.convertPcmToWav(response_audio_total),
            format: 'wav',
            transcript: response_text_total || undefined,
          };
        }
        resolve(result);
      };

      ws.onopen = () => {
        logger.debug('WebSocket connection is opening...');
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
              ...this.config.generationConfig,
            },
            ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
            ...(this.config.tools ? { tools: loadFile(this.config.tools, context?.vars) } : {}),
            ...(systemInstruction ? { systemInstruction } : {}),
          },
        };
        logger.debug(`WebSocket sent: ${JSON.stringify(setupMessage)}`);
        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = async (event) => {
        // Handle different data types from WebSocket
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
              if (audioCompletionTimer) {
                clearTimeout(audioCompletionTimer);
              }
              audioCompletionTimer = setTimeout(() => {
                if (hasAudioContent || isAudioExpected) {
                  hasAudioStreamEnded = true;
                }
                if (hasTextStreamEnded && hasAudioStreamEnded) {
                  finalizeResponse();
                }
              }, 1500);
            }
            return;
          }
        } else if (typeof event.data === 'string') {
          responseData = event.data;
        } else {
          logger.warn(`Unexpected event.data type: ${typeof event.data}`);
          ws.close();
          resolve({ error: 'Unexpected response data format' });
          return;
        }

        try {
          const responseText = await new Response(responseData).text();
          const response = JSON.parse(responseText);

          if (response.setupComplete) {
            const contentMessage = formatContentMessage(contents, contentIndex);
            contentIndex += 1;
            logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
            ws.send(JSON.stringify(contentMessage));
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
                  if (audioCompletionTimer) {
                    clearTimeout(audioCompletionTimer);
                  }
                  audioCompletionTimer = setTimeout(() => {
                    if (hasAudioContent || isAudioExpected) {
                      hasAudioStreamEnded = true;
                    }
                    if (hasTextStreamEnded && hasAudioStreamEnded) {
                      finalizeResponse();
                    }
                  }, 1500);
                }
              }
            }
          } else if (response.serverContent?.generationComplete) {
            if (isTextExpected && !hasTextStreamEnded) {
              hasTextStreamEnded = true;
            }
            if (hasTextStreamEnded && hasAudioStreamEnded) {
              finalizeResponse();
              return;
            }
          } else if (response.serverContent?.turnComplete && contentIndex >= contents.length) {
            if (isTextExpected && !hasTextStreamEnded) {
              hasTextStreamEnded = true;
            }
            if (isAudioExpected && !hasAudioStreamEnded) {
              if (hasAudioContent) {
                if (!audioCompletionTimer) {
                  audioCompletionTimer = setTimeout(() => {
                    hasAudioStreamEnded = true;
                    if (hasTextStreamEnded && hasAudioStreamEnded) {
                      finalizeResponse();
                    }
                  }, 500);
                }
              } else {
                hasAudioStreamEnded = true;
              }
            }
            if (hasTextStreamEnded && hasAudioStreamEnded) {
              finalizeResponse();
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
                    callbackResponse = await this.config.functionToolCallbacks[functionName](
                      JSON.stringify(
                        typeof functionCall.args === 'string'
                          ? JSON.parse(functionCall.args)
                          : functionCall.args,
                      ),
                    );
                  } else if (this.config.functionToolStatefulApi) {
                    logger.warn('functionToolStatefulApi configured but no HTTP client implemented for it after cleanup.');
                    callbackResponse = { error: 'Stateful API call with HTTP not implemented' };
                  }
                } catch (err) {
                  callbackResponse = { error: `Error executing function ${functionName}: ${JSON.stringify(err)}` };
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
          } else if (response.streamingCustomOp?.['type.googleapis.com/google.ai.generativelanguage.v1alpha.StreamingCustomOpOutput']?.audioCompletionSignal) {
            hasAudioStreamEnded = true;
            if (audioCompletionTimer) {
              clearTimeout(audioCompletionTimer);
            }
          } else if (
            !response.setupComplete &&
            !response.serverContent &&
            !response.toolCall &&
            !response.realtimeInput &&
            !response.candidates &&
            !response.streamingCustomOp
          ) {
            logger.warn(`Received unhandled WebSocket message structure: ${JSON.stringify(response).substring(0,200)}`);
          }
        } catch (err) {
          logger.error(`Failed to process WebSocket response: ${JSON.stringify(err)}`);
          ws.close();
          resolve({ error: `Failed to process WebSocket response: ${JSON.stringify(err)}` });
        }
      };

      ws.onerror = (err) => {
        logger.error(`WebSocket error: ${JSON.stringify(err)}`);
        clearTimeout(timeout);
        ws.close();
        resolve({ error: `WebSocket error: ${JSON.stringify(err)}` });
      };

      ws.onclose = (event) => {
        logger.debug(
          `WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`,
        );
        if (statefulApi && !statefulApi.killed) {
          statefulApi.kill('SIGTERM');
        }
        clearTimeout(timeout);
        if (audioCompletionTimer) {
          clearTimeout(audioCompletionTimer);
        }
        // If the promise hasn't been resolved yet and the closure was unexpected, reject.
        // This is a fallback; most paths should resolve the promise earlier.
      };
    });
  }
}
