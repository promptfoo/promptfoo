import axios from 'axios';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
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
    // Convert base64 PCM to WAV format for browser playability
    const pcmBuffer = Buffer.from(base64PcmData, 'base64');
    const wavBuffer = this.createWavHeader(pcmBuffer.length, 24000, 16, 1);
    const wavData = Buffer.concat([wavBuffer, pcmBuffer]);
    return wavData.toString('base64');
  }

  private createWavHeader(dataLength: number, sampleRate: number, bitsPerSample: number, channels: number): Buffer {
    const header = Buffer.alloc(44);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // byte rate
    header.writeUInt16LE(channels * bitsPerSample / 8, 32); // block align
    header.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
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
        ws.close();
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 10000);

      let response_text_total = '';
      let response_audio_total = '';
      let hasAudioContent = false;
      const function_calls_total: FunctionCall[] = [];
      let audioCompletionTimer: NodeJS.Timeout | null = null;

      ws.onmessage = async (event) => {
        // Handle different data types from WebSocket
        let responseData: string;
        
        if (event.data instanceof ArrayBuffer || event.data instanceof Buffer) {
          // Convert to string and check if it's JSON or binary audio
          const dataString = event.data.toString('utf-8');
          try {
            JSON.parse(dataString);
            // Valid JSON - treat as normal JSON message
            responseData = dataString;
            logger.debug('Received JSON message in binary format');
          } catch {
            // Not JSON - this is actual binary audio data
            const byteLength = event.data instanceof ArrayBuffer ? event.data.byteLength : event.data.length;
            logger.debug(`Received binary audio data: ${byteLength} bytes`);
            hasAudioContent = true;
            const audioBuffer = Buffer.isBuffer(event.data) ? event.data : Buffer.from(event.data);
            response_audio_total += audioBuffer.toString('base64');
            logger.debug(`Accumulated audio data: ${response_audio_total.length} chars`);
            return; // Don't process as JSON
          }
        } else if (typeof event.data === 'string') {
          responseData = event.data;
        } else {
          logger.debug(`Unexpected event.data type: ${typeof event.data}`);
          ws.close();
          resolve({ error: 'Unexpected response data format' });
          return;
        }
        
        logger.debug(`Received WebSocket response: ${responseData}`);
        try {

          const responseText = await new Response(responseData).text();
          const response = JSON.parse(responseText);
          
          // Log response structure for debugging
          if (response.serverContent) {
            logger.debug(`Response structure - serverContent keys: ${Object.keys(response.serverContent)}`);
            if (response.serverContent.modelTurn) {
              logger.debug(`ModelTurn keys: ${Object.keys(response.serverContent.modelTurn)}`);
              if (response.serverContent.modelTurn.parts) {
                logger.debug(`Parts count: ${response.serverContent.modelTurn.parts.length}`);
                response.serverContent.modelTurn.parts.forEach((part: any, i: number) => {
                  logger.debug(`Part ${i} keys: ${Object.keys(part)}`);
                  if (part.inlineData) {
                    logger.debug(`Part ${i} inlineData mimeType: ${part.inlineData.mimeType}`);
                  }
                });
              }
            }
          }

          // Handle setup complete response
          if (response.setupComplete) {
            const contentMessage = formatContentMessage(contents, contentIndex);
            contentIndex += 1;
            logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
            ws.send(JSON.stringify(contentMessage));
          }
          // Handle model response
          else if (response.serverContent?.modelTurn?.parts?.[0]?.text) {
            response_text_total =
              response_text_total + response.serverContent.modelTurn.parts[0].text;
          }
          // Handle audio response - check multiple possible paths
          else if (response.serverContent?.modelTurn?.parts) {
            // Check all parts for audio data
            for (const part of response.serverContent.modelTurn.parts) {
              if (part.inlineData?.mimeType?.includes('audio')) {
                hasAudioContent = true;
                response_audio_total += part.inlineData.data;
                logger.debug(`Received audio data chunk: ${part.inlineData.data.length} chars, mimeType: ${part.inlineData.mimeType}`);
              }
            }
          }
          // Check for audio in direct serverContent path
          else if (response.serverContent?.inlineData?.mimeType?.includes('audio')) {
            hasAudioContent = true;
            response_audio_total += response.serverContent.inlineData.data;
            logger.debug(`Received direct audio data: ${response.serverContent.inlineData.data.length} chars`);
          }
          // Check for audio in different response structure
          else if (response.serverContent?.parts?.[0]?.inlineData?.mimeType?.includes('audio')) {
            hasAudioContent = true;
            response_audio_total += response.serverContent.parts[0].inlineData.data;
            logger.debug(`Received parts audio data: ${response.serverContent.parts[0].inlineData.data.length} chars`);
          } else if (response.toolCall?.functionCalls) {
            for (const functionCall of response.toolCall.functionCalls) {
              function_calls_total.push(functionCall);
              if (functionCall && functionCall.id && functionCall.name) {
                let callbackResponse = {};

                // Handle function tool callbacks
                const functionName = functionCall.name;
                try {
                  if (
                    this.config.functionToolCallbacks &&
                    this.config.functionToolCallbacks[functionName]
                  ) {
                    callbackResponse = await this.config.functionToolCallbacks[functionName](
                      JSON.stringify(
                        typeof functionCall.args === 'string'
                          ? JSON.parse(functionCall.args)
                          : functionCall.args,
                      ),
                    );
                  } else if (this.config.functionToolStatefulApi) {
                    const url = new URL(functionName, this.config.functionToolStatefulApi.url).href;
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
          } else if (response.serverContent?.turnComplete) {
            if (contentIndex < contents.length) {
              const contentMessage = formatContentMessage(contents, contentIndex);
              contentIndex += 1;
              logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
              ws.send(JSON.stringify(contentMessage));
            } else {
              // Check if we're waiting for audio data
              if (this.config.generationConfig?.response_modalities?.includes('audio') && !hasAudioContent) {
                logger.debug('Turn complete but no audio received yet, waiting...');
                return; // Continue waiting for audio
              }
              let statefulApiState;
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
              resolve({
                output: {
                  text: response_text_total || (hasAudioContent ? '[Audio response generated]' : ''),
                  toolCall: { functionCalls: function_calls_total },
                  statefulApiState,
                  ...(hasAudioContent && response_audio_total ? {
                    audio: {
                      data: this.convertPcmToWav(response_audio_total),
                      format: 'wav',
                      transcript: response_text_total,
                    }
                  } : {}),
                },
                metadata: {
                  ...(response.groundingMetadata && {
                    groundingMetadata: response.groundingMetadata,
                  }),
                  ...(response.groundingChunks && { groundingChunks: response.groundingChunks }),
                  ...(response.groundingSupports && {
                    groundingSupports: response.groundingSupports,
                  }),
                  ...(response.webSearchQueries && { webSearchQueries: response.webSearchQueries }),
                  audioDebug: {
                    hasAudioContent,
                    audioDataLength: response_audio_total.length,
                    responseTextLength: response_text_total.length,
                  },
                },
              });
              ws.close();
            }
          }
          // Check for realtimeInput messages (Google Live specific)
          else if (response.realtimeInput) {
            logger.debug(`Realtime input message: ${JSON.stringify(response.realtimeInput)}`);
            if (response.realtimeInput.mediaChunks) {
              for (const chunk of response.realtimeInput.mediaChunks) {
                if (chunk.mimeType?.includes('audio')) {
                  hasAudioContent = true;
                  response_audio_total += chunk.data;
                  logger.debug(`Received realtime audio chunk: ${chunk.data.length} chars`);
                }
              }
            }
          }
          // Check for different audio message structure
          else if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData?.mimeType?.includes('audio')) {
                hasAudioContent = true;
                response_audio_total += part.inlineData.data;
                logger.debug(`Received candidates audio: ${part.inlineData.data.length} chars`);
              }
            }
          } else {
            // Log any unhandled message types that might contain audio
            logger.debug(`Unhandled message type. Response keys: ${Object.keys(response)}`);
            if (JSON.stringify(response).includes('audio') || JSON.stringify(response).includes('inline') || JSON.stringify(response).includes('media')) {
              logger.debug(`Potential audio message: ${JSON.stringify(response)}`);
            }
            
            // Debug: Log full response structure when no audio is found
            if (this.config.generationConfig?.response_modalities?.includes('audio')) {
              logger.debug(`Audio requested but not found. Full response: ${JSON.stringify(response, null, 2)}`);
            }
          }
        } catch (err) {
          logger.debug(`Failed to process response: ${JSON.stringify(err)}`);
          ws.close();
          resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        logger.debug(`WebSocket Error: ${JSON.stringify(err)}`);
        ws.close();
        resolve({ error: `WebSocket error: ${JSON.stringify(err)}` });
      };

      ws.onclose = (event) => {
        if (statefulApi && !statefulApi.killed) {
          statefulApi.kill('SIGTERM');
          logger.debug('Python process shutdown.');
        }
        clearTimeout(timeout);
        if (audioCompletionTimer) {
          clearTimeout(audioCompletionTimer);
        }
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
    });
  }
}
