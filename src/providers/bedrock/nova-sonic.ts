import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AwsBedrockGenericProvider, type BedrockAmazonNovaSonicGenerationOptions } from '.';
import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';

// Configuration types
interface SessionState {
  queue: any[];
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  responseHandlers: Map<string, (data: any) => void>;
  isActive: boolean;
  audioContentId: string;
  promptName: string;
}

const DEFAULT_CONFIG = {
  inference: {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7,
  },
  audio: {
    input: {
      audioType: 'SPEECH',
      encoding: 'base64',
      mediaType: 'audio/lpcm',
      sampleRateHertz: 8000,
      sampleSizeBits: 16,
      channelCount: 1,
    },
    output: {
      audioType: 'SPEECH',
      encoding: 'base64',
      mediaType: 'audio/lpcm',
      sampleRateHertz: 16000,
      sampleSizeBits: 16,
      channelCount: 1,
      voiceId: 'tiffany',
    },
  },
  text: {
    mediaType: 'text/plain',
  },
};

export class NovaSonicProvider extends AwsBedrockGenericProvider implements ApiProvider {
  private sessions = new Map<string, SessionState>();
  private bedrockClient: BedrockRuntimeClient;
  config: BedrockAmazonNovaSonicGenerationOptions;

  constructor(modelName: string = 'amazon.nova-sonic-v1:0', options: ProviderOptions = {}) {
    super(modelName, options);
    this.config = options.config;
    this.bedrockClient = new BedrockRuntimeClient({
      region: this.getRegion(),
      requestHandler: new NodeHttp2Handler({
        requestTimeout: 300000,
        sessionTimeout: 300000,
        disableConcurrentStreams: false,
        maxConcurrentStreams: 20,
      }),
    });
  }

  private createSession(sessionId: string = randomUUID()): SessionState {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: SessionState = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseHandlers: new Map(),
      isActive: true,
      audioContentId: randomUUID(),
      promptName: randomUUID(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  private async sendEvent(sessionId: string, event: any) {
    if (Object.keys(event.event)[0] !== 'audioInput') {
      logger.debug('sendEvent: ' + Object.keys(event.event)[0]);
    }
    const session = this.sessions.get(sessionId);
    if (!session?.isActive) {
      logger.error(`Session ${sessionId} is not active`);
      return;
    }

    session.queue.push(event);
    session.queueSignal.next();
  }

  async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    } else if (!session.isActive) {
      logger.debug(`Session ${sessionId} is not active`);
      return;
    }

    // Wait a moment for any final events
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await this.sendEvent(sessionId, {
      event: {
        promptEnd: {
          promptName: session.promptName,
        },
      },
    });

    // Wait for any final events after prompt end
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await this.sendEvent(sessionId, {
      event: {
        sessionEnd: {},
      },
    });

    session.isActive = false;

    logger.debug('Session closed');
  }

  async sendTextMessage(sessionId: string, role: 'USER' | 'ASSISTANT' | 'SYSTEM', prompt: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const textPromptID = randomUUID();
    logger.debug('sendTextMessage: ' + prompt);
    this.sendEvent(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: 'TEXT',
          interactive: false,
          role,
          textInputConfiguration: this.config?.textInputConfiguration || DEFAULT_CONFIG.text,
        },
      },
    });

    // Text input content for system prompt
    this.sendEvent(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content: prompt,
        },
      },
    });

    // Text content end
    this.sendEvent(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      },
    });
  }

  async sendSystemPrompt(sessionId: string, prompt: string) {
    return this.sendTextMessage(sessionId, 'SYSTEM', prompt);
  }

  async sendChatTextHistory(sessionId: string, role: 'USER' | 'ASSISTANT', prompt: string) {
    return this.sendTextMessage(sessionId, role, prompt);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const sessionId = randomUUID();
    const session = this.createSession(sessionId);

    let assistantTranscript = '';
    let userTranscript = '';
    let audioContent = '';
    let hasAudioContent = false;
    let functionCallOccurred = false;

    logger.debug('prompt: ' + prompt.slice(0, 1000));
    // Set up event handlers
    session.responseHandlers.set('textOutput', (data) => {
      logger.debug('textOutput: ' + JSON.stringify(data));
      if (data.role === 'USER') {
        userTranscript += data.content + '\n';
      } else if (data.role === 'ASSISTANT') {
        assistantTranscript += data.content + '\n';
      }
    });

    session.responseHandlers.set('contentEnd', async (data) => {
      logger.debug('contentEnd');
      if (data.stopReason === 'END_TURN') {
        await this.endSession(sessionId);
      }
    });

    session.responseHandlers.set('audioOutput', (data) => {
      hasAudioContent = true;
      logger.debug('audioOutput');
      audioContent += data.content;
    });

    session.responseHandlers.set('toolUse', async (data) => {
      logger.debug('toolUse');
      functionCallOccurred = true;
      // const result = await this.handleToolUse(data.toolName, data);
      const result = 'Tool result';
      const toolResultId = randomUUID();

      await this.sendEvent(sessionId, {
        event: {
          contentStart: {
            promptName: session.promptName,
            contentName: toolResultId,
            interactive: false,
            type: 'TOOL',
            role: 'TOOL',
            toolResultInputConfiguration: {
              toolUseId: data.toolUseId,
              type: 'TEXT',
              textInputConfiguration: {
                mediaType: 'text/plain',
              },
            },
          },
        },
      });
      await this.sendEvent(sessionId, {
        event: {
          toolResult: {
            promptName: session.promptName,
            contentName: toolResultId,
            content: JSON.stringify(result),
          },
        },
      });

      await this.sendEvent(sessionId, {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: toolResultId,
          },
        },
      });
    });

    try {
      // Process response stream
      const request = this.bedrockClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: this.modelName,
          body: this.createAsyncIterable(sessionId),
        }),
      );

      logger.debug('Sending sessionStart');
      // Initialize session
      await this.sendEvent(sessionId, {
        event: {
          sessionStart: {
            inferenceConfiguration: this.config?.interfaceConfig || DEFAULT_CONFIG.inference,
          },
        },
      });

      logger.debug('Sending promptStart');
      // Start prompt
      await this.sendEvent(sessionId, {
        event: {
          promptStart: {
            promptName: session.promptName,
            textOutputConfiguration: this.config?.textOutputConfiguration || DEFAULT_CONFIG.text,
            audioOutputConfiguration:
              this.config?.audioOutputConfiguration || DEFAULT_CONFIG.audio.output,
            ...(this.config?.toolConfig && { toolConfiguration: this.config?.toolConfig }),
          },
        },
      });

      logger.debug('Sending system prompt');
      await this.sendSystemPrompt(sessionId, context?.test?.metadata?.systemPrompt || '');

      logger.debug('Processing conversation history');
      let promptText = prompt;

      try {
        // Check if the prompt is a JSON string
        const parsedPrompt = JSON.parse(prompt);

        if (Array.isArray(parsedPrompt)) {
          // Handle array of messages format
          for (const [index, message] of parsedPrompt.entries()) {
            if (message.role !== 'system' && index !== parsedPrompt.length - 1) {
              await this.sendTextMessage(
                sessionId,
                message.role.toUpperCase(),
                message.content[0].text,
              );
            }
          }
          promptText = parsedPrompt[parsedPrompt.length - 1].content[0].text;
        }
      } catch (err) {
        logger.error(`Error processing conversation history: ${err}`);
      }

      logger.debug('Sending audioInput start');
      // Send prompt content
      await this.sendEvent(sessionId, {
        event: {
          contentStart: {
            promptName: session.promptName,
            contentName: session.audioContentId,
            type: 'AUDIO',
            interactive: true,
            role: 'USER',
            audioInputConfiguration:
              this.config?.audioInputConfiguration || DEFAULT_CONFIG.audio.input,
          },
        },
      });

      logger.debug('Sending audioInput chunks');

      // Send the actual prompt
      const chunks = promptText?.match(/.{1,1024}/g)?.map((chunk) => Buffer.from(chunk)) || [];
      logger.debug('audioInput in chunks: ' + chunks.length);
      for (const chunk of chunks) {
        await this.sendEvent(sessionId, {
          event: {
            audioInput: {
              promptName: session.promptName,
              contentName: session.audioContentId,
              content: chunk.toString(),
            },
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      logger.debug('Sending audioInput end');
      // End content and prompt
      await this.sendEvent(sessionId, {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: session.audioContentId,
          },
        },
      });

      const response = await request;

      if (response.body) {
        for await (const event of response.body) {
          if (!session.isActive) {
            break;
          }

          if (event.chunk?.bytes) {
            const data = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            const eventType = Object.keys(data.event || {})[0];
            logger.debug('processing eventType: ' + eventType);
            const handler = session.responseHandlers.get(eventType);
            if (handler) {
              await handler(data.event[eventType]);
            }
          }
        }
      }

      const audioConfig = this.config?.audioOutputConfiguration || DEFAULT_CONFIG.audio.output;
      const audioOutput =
        hasAudioContent && audioContent
          ? {
              audio: {
                data: this.convertRawToWav(
                  Buffer.from(audioContent, 'base64'),
                  audioConfig.sampleRateHertz,
                  audioConfig.sampleSizeBits,
                  audioConfig.channelCount,
                ).toString('base64'),
                format: 'wav',
                transcript: assistantTranscript,
              },
              userTranscript,
            }
          : {};

      return {
        output: assistantTranscript || '[No response received from API]',
        ...audioOutput,
        // TODO: Add token usage
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
        cached: false,
        metadata: {
          ...audioOutput,
          functionCallOccurred,
        },
      };
    } catch (error) {
      logger.error('Error in nova-sonic provider: ' + JSON.stringify(error));
      return {
        error: error instanceof Error ? error.message : String(error),
        metadata: {},
      };
    } finally {
      await this.endSession(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  private createAsyncIterable(
    sessionId: string,
  ): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (!session.isActive) {
            return { done: true, value: undefined };
          }

          if (session.queue.length === 0) {
            try {
              await Promise.race([
                firstValueFrom(session.queueSignal.pipe(take(1))),
                firstValueFrom(session.closeSignal.pipe(take(1))),
              ]);
            } catch {
              return { done: true, value: undefined };
            }
          }

          const nextEvent = session.queue.shift();
          if (nextEvent) {
            return {
              value: {
                chunk: {
                  bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                },
              },
              done: false,
            };
          } else {
            return { done: true, value: undefined };
          }
        },
      }),
    };
  }

  private convertRawToWav(
    audioData: Buffer,
    sampleRate: number = 8000,
    bitsPerSample: number = 16,
    channels: number = 1,
  ): Buffer {
    const dataLength = audioData.length;
    const fileLength = 44 + dataLength;
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileLength - 8, 4);
    header.write('WAVE', 8);

    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(channels, 22); // number of channels
    header.writeUInt32LE(sampleRate, 24); // sample rate
    header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28); // byte rate
    header.writeUInt16LE((channels * bitsPerSample) / 8, 32); // block align
    header.writeUInt16LE(bitsPerSample, 34); // bits per sample

    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);

    return Buffer.concat([header, audioData]);
  }
}
