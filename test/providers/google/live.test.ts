import path from 'path';

import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import WebSocket from 'ws';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { fetchJson, GoogleLiveProvider, tryGetThenPost } from '../../../src/providers/google/live';
import * as fetchModule from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

const mockFetchWithProxy = vi.mocked(fetchModule.fetchWithProxy);

const originalSetTimeout = global.setTimeout;
// Mock Python startup delays during each test, then restore the global timer.
const mockSetTimeout = vi.fn((callback: any, delay?: number, ...args: any[]) => {
  // For delays of 1000ms (Python startup), execute immediately
  if (delay === 1000) {
    return originalSetTimeout(callback, 0, ...args);
  }
  // For other delays, use the original setTimeout
  return originalSetTimeout(callback, delay, ...args);
});

vi.mock('ws');
vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});
vi.mock('../../../src/python/pythonUtils', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    validatePythonPath: vi.fn().mockImplementation(async function (pythonPath) {
      return pythonPath;
    }),
  };
});
vi.mock('child_process', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Use immediate callback instead of setTimeout
          setImmediate(callback);
        }
      }),
      kill: vi.fn(),
      killed: false,
    })),
  };
});
vi.mock('../../../src/util/fetch/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithProxy: vi.fn(),
  };
});
vi.mock('../../../src/providers/google/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    // Mock getGoogleAccessToken to return undefined (no OAuth2 credentials)
    // This prevents the test from actually trying to authenticate with Google
    getGoogleAccessToken: vi.fn().mockResolvedValue(undefined),
  };
});

const mockImportModule = vi.mocked(importModule);

// Faster message simulation helpers - use setImmediate instead of setTimeout
const simulateMessage = (mockWs: Mocked<WebSocket>, simulated_data: any) => {
  setImmediate(() => {
    mockWs.onmessage?.({
      data: JSON.stringify(simulated_data),
    } as WebSocket.MessageEvent);
  });
};

const simulatePartsMessage = (mockWs: Mocked<WebSocket>, simulated_parts: any) => {
  simulateMessage(mockWs, { serverContent: { modelTurn: { parts: simulated_parts } } });
};

const simulateTextMessage = (mockWs: Mocked<WebSocket>, simulated_text: string) => {
  simulatePartsMessage(mockWs, [{ text: simulated_text }]);
};

const simulateFunctionCallMessage = (mockWs: Mocked<WebSocket>, simulated_calls: any) => {
  simulateMessage(mockWs, { toolCall: { functionCalls: simulated_calls } });
};

const simulateSetupMessage = (mockWs: Mocked<WebSocket>) => {
  simulateMessage(mockWs, { setupComplete: {} });
};

const simulateCompletionMessage = (mockWs: Mocked<WebSocket>) => {
  simulateMessage(mockWs, { serverContent: { turnComplete: true } });
};

const flushAsyncEvents = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
};

describe('GoogleLiveProvider', () => {
  let mockWs: Mocked<WebSocket>;
  let provider: GoogleLiveProvider;

  beforeEach(async () => {
    global.setTimeout = mockSetTimeout as unknown as typeof setTimeout;
    mockSetTimeout.mockClear();

    // Reset mocks that hold call history or implementations across tests so
    // shuffled-order runs see a clean slate. clearAllMocks in afterEach clears
    // call history but preserves implementations, and async work scheduled by
    // a prior test can still record calls before the next test runs.
    mockFetchWithProxy.mockReset();

    const spawnMock = vi.mocked((await import('child_process')).spawn);
    spawnMock.mockReset();
    spawnMock.mockImplementation(
      () =>
        ({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event, callback) => {
            if (event === 'close') {
              setImmediate(callback);
            }
          }),
          kill: vi.fn(),
          killed: false,
        }) as any,
    );

    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onopen: vi.fn(),
    } as unknown as Mocked<WebSocket>;

    vi.mocked(WebSocket).mockImplementation(function () {
      return mockWs;
    });

    // Reset validatePythonPath mock for each test
    vi.mocked(
      (await import('../../../src/python/pythonUtils')).validatePythonPath,
    ).mockImplementation(async function (pythonPath: string) {
      return pythonPath;
    });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    vi.clearAllMocks();
  });

  it('should initialize with correct config', () => {
    expect(provider.modelName).toBe('gemini-2.0-flash-exp');
    expect(provider.config.generationConfig?.response_modalities?.[0]).toBe('text');
  });

  it('should return the correct id', () => {
    expect(provider.id()).toBe('google:live:gemini-2.0-flash-exp');
  });

  it('should send client_content for older Live models', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'test');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi('test prompt');

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages[1]).toEqual({
      client_content: {
        turns: [
          {
            role: 'user',
            parts: [{ text: 'test prompt' }],
          },
        ],
        turn_complete: true,
      },
    });
  });

  it('should send realtime_input for Gemini 3.1 Live prompts', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'test');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi('test prompt');

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.v1beta.GenerativeService.BidiGenerateContent'),
    );
    expect(sentMessages[0]).toMatchObject({
      setup: {
        generation_config: { response_modalities: ['AUDIO'] },
        output_audio_transcription: {},
      },
    });
    expect(sentMessages[1]).toEqual({
      realtime_input: {
        text: 'test prompt',
      },
    });
  });

  it('should send mixed text and image parts as Gemini 3.1 realtime input', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { text: 'Describe this image.' },
            { inline_data: { mime_type: 'image/jpeg', data: 'aW1hZ2U=' } },
          ],
        },
      ]),
    );

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages.slice(1)).toEqual([
      { realtime_input: { video: { mime_type: 'image/jpeg', data: 'aW1hZ2U=' } } },
      { realtime_input: { text: 'Describe this image.' } },
    ]);
    expect(debugSpy).toHaveBeenCalledWith('WebSocket sent', { messageCount: 2 });
    expect(
      debugSpy.mock.calls.some(
        ([message]) =>
          String(message).startsWith('WebSocket sent') && String(message).includes('aW1hZ2U='),
      ),
    ).toBe(false);
    debugSpy.mockRestore();
  });

  it('should terminate finite Gemini 3.1 Live audio input', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'user', parts: [{ inline_data: { mime_type: 'audio/pcm', data: 'YXVkaW8=' } }] },
      ]),
    );

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages.slice(1)).toEqual([
      { realtime_input: { audio: { mime_type: 'audio/pcm', data: 'YXVkaW8=' } } },
      { realtime_input: { audio_stream_end: true } },
    ]);
  });

  it('should send mixed Gemini 3.1 Live text before ending the audio stream', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio.' },
            { inline_data: { mime_type: 'audio/pcm', data: 'YXVkaW8=' } },
          ],
        },
      ]),
    );

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages.slice(1)).toEqual([
      { realtime_input: { audio: { mime_type: 'audio/pcm', data: 'YXVkaW8=' } } },
      { realtime_input: { text: 'Transcribe this audio.' } },
      { realtime_input: { audio_stream_end: true } },
    ]);
  });

  it('should combine multiple Gemini 3.1 Live text parts into one turn-ending input', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['TEXT'] },
        timeoutMs: 500,
        apiKey: 'key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'combined');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'user', parts: [{ text: 'First clause.' }, { text: 'Second clause.' }] },
      ]),
    );

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages[0]).toMatchObject({
      setup: {
        generation_config: { response_modalities: ['AUDIO'] },
        output_audio_transcription: {},
      },
    });
    expect(sentMessages.slice(1)).toEqual([
      { realtime_input: { text: 'First clause.\nSecond clause.' } },
    ]);
  });

  it('should process Gemini 3.1 multi-field server content before finalizing', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: {
          response_modalities: ['audio'],
          outputAudioTranscription: {},
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, {
          serverContent: {
            modelTurn: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: Buffer.from('audio').toString('base64'),
                  },
                },
              ],
            },
            outputTranscription: { text: 'Rivers carry salt.' },
            turnComplete: true,
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.output).toMatchObject({
      text: 'Rivers carry salt.',
      toolCall: { functionCalls: [] },
    });
    expect(response.audio).toMatchObject({
      format: 'wav',
      transcript: 'Rivers carry salt.',
    });
  });

  it('should preserve padded Gemini Live audio chunks when assembling the WAV response', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, {
          serverContent: {
            modelTurn: {
              parts: [
                { inlineData: { mimeType: 'audio/pcm', data: 'YQ==' } },
                { inlineData: { mimeType: 'audio/pcm', data: 'Yg==' } },
              ],
            },
            turnComplete: true,
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    const wav = Buffer.from(response.audio?.data || '', 'base64');

    expect(wav.subarray(44).toString()).toBe('ab');
    expect(wav.readUInt32LE(40)).toBe(2);
  });

  it('should return a clear error for an unsupported inline video container', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: { apiKey: 'test-api-key', timeoutMs: 500 },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        { role: 'user', parts: [{ inline_data: { mime_type: 'video/mp4', data: 'dmlkZW8=' } }] },
      ]),
    );

    expect(response.error).toContain(
      'Google Live video input must be sent as individual image/jpeg or image/png frames',
    );
  });

  it('should return a clear error for an unsupported Live image-frame format', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: { apiKey: 'test-api-key', timeoutMs: 500 },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        { role: 'user', parts: [{ inline_data: { mime_type: 'image/webp', data: 'aW1hZ2U=' } }] },
      ]),
    );

    expect(response.error).toContain(
      'Unsupported Google Live realtime input MIME type: image/webp',
    );
  });

  it('should pace multiple Live image frames in one user turn', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: { apiKey: 'test-api-key', timeoutMs: 2_500 },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        setTimeout(() => {
          simulateTextMessage(mockWs, 'video received');
          simulateCompletionMessage(mockWs);
        }, 1_100);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: 'ZnJhbWUx' } },
            { inline_data: { mime_type: 'image/png', data: 'ZnJhbWUy' } },
          ],
        },
      ]),
    );

    expect(response.error).toBeUndefined();
    expect(mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string))).toEqual([
      expect.objectContaining({ setup: expect.any(Object) }),
      { realtime_input: { video: { mime_type: 'image/jpeg', data: 'ZnJhbWUx' } } },
      { realtime_input: { video: { mime_type: 'image/png', data: 'ZnJhbWUy' } } },
      { client_content: { turn_complete: true } },
    ]);
    expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 3_500);
  });

  it('should report Gemini 3.1 Live token usage and modality-aware cost', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'hello');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 1_000,
            responseTokenCount: 500,
            totalTokenCount: 1_500,
            promptTokensDetails: [
              { modality: 'TEXT', tokenCount: 600 },
              { modality: 'AUDIO', tokenCount: 200 },
              { modality: 'IMAGE', tokenCount: 100 },
              { modality: 'VIDEO', tokenCount: 100 },
            ],
            responseTokensDetails: [
              { modality: 'TEXT', tokenCount: 400 },
              { modality: 'AUDIO', tokenCount: 100 },
            ],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.tokenUsage).toEqual({
      prompt: 1_000,
      completion: 500,
      total: 1_500,
      numRequests: 1,
    });
    expect(response.cost).toBeCloseTo(
      (600 * 0.75 + 200 * 3 + 200 * 1 + 400 * 4.5 + 100 * 12) / 1e6,
      12,
    );
  });

  it('should not double-bill a Gemini 3.1 Live still image as a video frame', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'image received');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 100,
            responseTokenCount: 100,
            totalTokenCount: 200,
            promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 100 }],
            responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'aW1hZ2U=' } }],
        },
      ]),
    );

    expect(response.cost).toBeCloseTo((100 * 1 + 100 * 4.5) / 1e6, 12);
  });

  it('should bill Gemini 3.1 Live video frames using the per-second input rate', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        setTimeout(() => {
          simulateTextMessage(mockWs, 'video received');
          simulateMessage(mockWs, { serverContent: { generationComplete: true } });
          simulateMessage(mockWs, {
            serverContent: { turnComplete: true },
            usageMetadata: {
              promptTokenCount: 516,
              responseTokenCount: 100,
              totalTokenCount: 616,
              promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 516 }],
              responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
            },
          });
        }, 20);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: 'ZnJhbWUx' } },
            { inline_data: { mime_type: 'image/png', data: 'ZnJhbWUy' } },
          ],
        },
      ]),
    );

    expect(response.cost).toBeCloseTo(2 * 0.000033333333333333335 + (100 * 4.5) / 1e6, 12);
  });

  it('should not count a Gemini 3.1 Live still image as an additional video second', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        setTimeout(() => {
          simulateTextMessage(mockWs, 'mixed media received');
          simulateMessage(mockWs, { serverContent: { generationComplete: true } });
          simulateMessage(mockWs, {
            serverContent: { turnComplete: true },
            usageMetadata: {
              promptTokenCount: 784,
              responseTokenCount: 100,
              totalTokenCount: 884,
              promptTokensDetails: [
                { modality: 'IMAGE', tokenCount: 258 },
                { modality: 'VIDEO', tokenCount: 526 },
              ],
              responseTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
            },
          });
        }, 20);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: 'c3RpbGw=' } },
            { inline_data: { mime_type: 'image/jpeg', data: 'ZnJhbWUx' } },
            { inline_data: { mime_type: 'image/png', data: 'ZnJhbWUy' } },
          ],
        },
      ]),
    );

    expect(response.cost).toBeCloseTo(
      (258 * 1 + 100 * 4.5) / 1e6 + 2 * 0.000033333333333333335,
      12,
    );
  });

  it('should bill Gemini 3.1 Live video frames when modality-token details are absent', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        setTimeout(() => {
          simulateTextMessage(mockWs, 'video received');
          simulateMessage(mockWs, { serverContent: { generationComplete: true } });
          simulateMessage(mockWs, {
            serverContent: { turnComplete: true },
            usageMetadata: { promptTokenCount: 10, responseTokenCount: 100, totalTokenCount: 110 },
          });
        }, 20);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        { role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'ZnJhbWU=' } }] },
      ]),
    );

    expect(response.cost).toBeCloseTo(0.000033333333333333335 + (10 * 0.75 + 100 * 4.5) / 1e6, 12);
  });

  it('should price a documented Gemini 2.5 Live model when usage metadata is returned', async () => {
    provider = new GoogleLiveProvider('gemini-live-2.5-flash-preview-native-audio-09-2025', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 1_000,
            responseTokenCount: 500,
            totalTokenCount: 1_500,
            promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1_000 }],
            responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 500 }],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.cost).toBeCloseTo((1_000 * 0.3 + 500 * 12) / 1e6, 12);
  });

  it('should not double-bill Gemini Live thinking tokens included in the response count', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'hello');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 100,
            responseTokenCount: 80,
            thoughtsTokenCount: 60,
            totalTokenCount: 180,
            promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
            responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 20 }],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.tokenUsage).toEqual({
      prompt: 100,
      completion: 80,
      total: 180,
      numRequests: 1,
      completionDetails: { reasoning: 60 },
    });
    expect(response.cost).toBeCloseTo((100 * 0.75 + 60 * 4.5 + 20 * 12) / 1e6, 12);
  });

  it('should apply the Gemini Live cached-input rate and report cached usage', async () => {
    provider = new GoogleLiveProvider('gemini-live-2.5-flash-preview-native-audio-09-2025', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 1_000,
            responseTokenCount: 500,
            totalTokenCount: 1_500,
            cachedContentTokenCount: 500,
            promptTokensDetails: [
              { modality: 'TEXT', tokenCount: 600 },
              { modality: 'AUDIO', tokenCount: 400 },
            ],
            cacheTokensDetails: [
              { modality: 'TEXT', tokenCount: 200 },
              { modality: 'AUDIO', tokenCount: 300 },
            ],
            responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 500 }],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.tokenUsage).toEqual({
      prompt: 1_000,
      completion: 500,
      total: 1_500,
      cached: 500,
      numRequests: 1,
    });
    expect(response.cost).toBeCloseTo((400 * 0.3 + 500 * 0.075 + 100 * 3 + 500 * 12) / 1e6, 12);
  });

  it('should prefer closing Gemini Live usage over an interim usage frame', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, {
          usageMetadata: {
            promptTokenCount: 80,
            responseTokenCount: 10,
            totalTokenCount: 90,
          },
        });
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 100,
            responseTokenCount: 20,
            totalTokenCount: 120,
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.tokenUsage).toEqual({
      prompt: 100,
      completion: 20,
      total: 120,
      numRequests: 1,
    });
    expect(response.cost).toBeCloseTo((100 * 0.75 + 20 * 4.5) / 1e6, 12);
  });

  it('should aggregate per-turn Gemini Live usage including tool and thought tokens', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'first');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 100,
            responseTokenCount: 20,
            toolUsePromptTokenCount: 40,
            thoughtsTokenCount: 60,
            totalTokenCount: 220,
            promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }],
            responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 20 }],
            toolUsePromptTokensDetails: [{ modality: 'TEXT', tokenCount: 40 }],
          },
        });
        simulateTextMessage(mockWs, 'second');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 140,
            responseTokenCount: 30,
            totalTokenCount: 170,
            promptTokensDetails: [{ modality: 'TEXT', tokenCount: 140 }],
            responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 30 }],
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        { role: 'user', content: 'first question' },
        { role: 'user', content: 'second question' },
      ]),
    );

    expect(response.output).toMatchObject({ text: 'firstsecond' });
    expect(response.tokenUsage).toEqual({
      prompt: 280,
      completion: 50,
      total: 390,
      numRequests: 2,
      completionDetails: { reasoning: 60 },
    });
    expect(response.cost).toBeCloseTo((280 * 0.75 + 50 * 12 + 60 * 4.5) / 1e6, 12);
  });

  it('should preserve Gemini Live usage reported with a tool-call frame', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, {
          toolCall: {
            functionCalls: [{ name: 'lookup', args: { q: 'test' }, id: 'tool-1' }],
          },
          usageMetadata: {
            promptTokenCount: 100,
            responseTokenCount: 20,
            totalTokenCount: 120,
          },
        });
        simulateTextMessage(mockWs, 'done');
        simulateMessage(mockWs, { serverContent: { generationComplete: true } });
        simulateMessage(mockWs, {
          serverContent: { turnComplete: true },
          usageMetadata: {
            promptTokenCount: 140,
            responseTokenCount: 30,
            totalTokenCount: 170,
          },
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    expect(response.tokenUsage).toEqual({
      prompt: 240,
      completion: 50,
      total: 290,
      numRequests: 2,
    });
    expect(response.cost).toBeCloseTo((240 * 0.75 + 50 * 4.5) / 1e6, 12);
  });

  it('should advance Gemini 3.1 multi-turn prompts after generationComplete', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: {
          response_modalities: ['audio'],
          outputAudioTranscription: {},
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateMessage(mockWs, {
          serverContent: {
            modelTurn: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: Buffer.from('audio').toString('base64'),
                  },
                },
              ],
            },
            outputTranscription: { text: 'First answer.' },
            generationComplete: true,
          },
        });
        simulateCompletionMessage(mockWs);
        simulateMessage(mockWs, {
          serverContent: {
            modelTurn: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm',
                    data: Buffer.from('audio').toString('base64'),
                  },
                },
              ],
            },
            outputTranscription: { text: ' Second answer.' },
            generationComplete: true,
          },
        });
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      JSON.stringify([
        { role: 'user', content: 'first prompt' },
        { role: 'user', content: 'second prompt' },
      ]),
    );

    const sentMessages = mockWs.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(sentMessages[1]).toEqual({ realtime_input: { text: 'first prompt' } });
    expect(sentMessages[2]).toEqual({ realtime_input: { text: 'second prompt' } });
    expect(debugSpy).toHaveBeenCalledWith('WebSocket sent (multi-turn)', { messageCount: 1 });
    expect(
      debugSpy.mock.calls.some(
        ([message]) =>
          String(message).startsWith('WebSocket sent') && String(message).includes('second prompt'),
      ),
    ).toBe(false);
    debugSpy.mockRestore();
    expect(response.output).toMatchObject({
      text: 'First answer. Second answer.',
      toolCall: { functionCalls: [] },
    });
  });

  it('should send message and handle basic response', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'test');
        simulateTextMessage(mockWs, ' response');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const responsePromise = provider.callApi('test prompt');

    const response = await responsePromise;
    expect(response).toEqual({
      output: {
        text: 'test response',
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should not advance a Gemini Live conversation twice for one completed generation', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        apiKey: 'test-api-key',
        timeoutMs: 500,
        generationConfig: { response_modalities: ['audio'] },
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event));
      return mockWs;
    });
    const responsePromise = provider.callApi(
      JSON.stringify([
        { role: 'user', content: 'first prompt' },
        { role: 'user', content: 'second prompt' },
        { role: 'user', content: 'third prompt' },
      ]),
    );
    await flushAsyncEvents();
    await flushAsyncEvents();
    const emit = async (data: any) => {
      await mockWs.onmessage?.({ data: JSON.stringify(data) } as WebSocket.MessageEvent);
    };

    await emit({ setupComplete: {} });
    expect(mockWs.send).toHaveBeenCalledTimes(2);
    await emit({
      serverContent: { outputTranscription: { text: 'one ' }, generationComplete: true },
    });
    expect(mockWs.send).toHaveBeenCalledTimes(2);
    await emit({ serverContent: { turnComplete: true } });
    expect(mockWs.send).toHaveBeenCalledTimes(3);
    await emit({
      serverContent: { outputTranscription: { text: 'two ' }, generationComplete: true },
    });
    expect(mockWs.send).toHaveBeenCalledTimes(3);
    await emit({ serverContent: { turnComplete: true } });
    expect(mockWs.send).toHaveBeenCalledTimes(4);
    await emit({
      serverContent: { outputTranscription: { text: 'three' }, generationComplete: true },
    });
    await emit({ serverContent: { turnComplete: true } });

    const response = await responsePromise;

    expect(response.output).toMatchObject({ text: 'one two three' });
  });

  it('should send message and handle function call response', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'weather_info = default_api.get_weather(city="San Francisco")\nprint(weather_info)\n',
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          {
            name: 'get_weather',
            args: { city: 'San Francisco' },
            id: 'function-call-14336847574026984983',
          },
        ]);
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '{}\n' } },
        ]);
        simulateTextMessage(mockWs, 'I was not able to retrieve weather information.');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const responsePromise = provider.callApi('test prompt');

    const response = await responsePromise;
    expect(response).toEqual({
      output: {
        text: 'I was not able to retrieve weather information.',
        toolCall: {
          functionCalls: [
            {
              name: 'get_weather',
              args: { city: 'San Francisco' },
              id: 'function-call-14336847574026984983',
            },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should send message and handle sequential function calls', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'default_api.call_me()\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'call_me', args: {}, id: 'function-call-10316808485615376693' },
        ]);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'default_api.call_me()\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'call_me', args: {}, id: 'function-call-15919291184864374131' },
        ]);
        simulateTextMessage(mockWs, "\n```tool_outputs\n{'status': 'called'}\n```\n");
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({
      output: {
        text: "\n```tool_outputs\n{'status': 'called'}\n```\n",
        toolCall: {
          functionCalls: [
            { name: 'call_me', args: {}, id: 'function-call-10316808485615376693' },
            { name: 'call_me', args: {}, id: 'function-call-15919291184864374131' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should send message and handle in-built google search tool', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'concise_search("why is the sea salty", max_num_results=5)\n',
            },
          },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: 'Looking up information on Google Search.\n',
            },
          },
        ]);
        simulateTextMessage(
          mockWs,
          'The sea is salty primarily due to the erosion of rocks on land. Rainwater,',
        );
        simulateTextMessage(
          mockWs,
          ' which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
        );
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');

    // Just check the output text, don't worry about metadata
    expect(response.output.text).toBe(
      'The sea is salty primarily due to the erosion of rocks on land. Rainwater, which is slightly acidic due to dissolved carbon dioxide, erodes rocks and carries dissolved minerals and salts into rivers.',
    );
    expect(response.output.toolCall.functionCalls).toEqual([]);
  });

  it('should send message and handle in-built code execution tool', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'result = 1341 * 23\nprint(result)\n' } },
        ]);
        simulateTextMessage(mockWs, '\n');
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '30843\n' } },
        ]);
        simulateTextMessage(mockWs, 'The result of multiplying 1341 by 23 is 30843.\n');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi('\n');
    expect(response).toEqual({
      output: {
        text: '\nThe result of multiplying 1341 by 23 is 30843.\n',
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should handle multiple user inputs', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'Hey there! How can I help you today?\n');
        simulateCompletionMessage(mockWs);
        simulateTextMessage(
          mockWs,
          "Okay, let's talk about Hawaii! It's a truly fascinating place with",
        );
        simulateTextMessage(mockWs, ' a unique culture, history, and geography.');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi(
      '[{"role":"user","content":"hey"},{"role":"user","content":"tell me about hawaii"}]',
    );
    expect(response).toEqual({
      output: {
        text: "Hey there! How can I help you today?\nOkay, let's talk about Hawaii! It's a truly fascinating place with a unique culture, history, and geography.",
        toolCall: { functionCalls: [] },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should handle WebSocket errors', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onerror?.({
          type: 'error',
          error: new Error('connection failed'),
          message: 'connection failed',
        } as WebSocket.ErrorEvent);
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    expect(response.error).toContain('WebSocket error');
  });

  it('should handle timeout', async () => {
    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 100,
        apiKey: 'test-api-key',
      },
    });

    const response = await provider.callApi('test prompt');
    expect(response).toEqual({ error: 'WebSocket request timed out' });
  });

  it('should keep the Live request timeout active after a partial text response', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['text'] },
        timeoutMs: 30,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateTextMessage(mockWs, 'partial response');
      });
      return mockWs;
    });

    await expect(provider.callApi('test prompt')).resolves.toEqual({
      error: 'WebSocket request timed out',
    });
  });

  it('should keep the Live request timeout active after a partial binary-audio response', async () => {
    provider = new GoogleLiveProvider('gemini-3.1-flash-live-preview', {
      config: {
        generationConfig: { response_modalities: ['audio'] },
        timeoutMs: 30,
        apiKey: 'test-api-key',
      },
    });
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        mockWs.onmessage?.({
          type: 'message',
          data: Buffer.from('partial audio'),
          target: mockWs,
        } as WebSocket.MessageEvent);
      });
      return mockWs;
    });

    await expect(provider.callApi('test prompt')).resolves.toEqual({
      error: 'WebSocket request timed out',
    });
  });

  it('should ignore tool call messages that arrive after the websocket has closed', async () => {
    const lateCallback = vi.fn().mockResolvedValue({ ignored: true });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'lateFunction',
                description: 'A function call that arrives too late',
              },
            ],
          },
        ],
        functionToolCallbacks: {
          lateFunction: lateCallback,
        },
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        setImmediate(() => {
          mockWs.onclose?.({
            wasClean: false,
            code: 1006,
            reason: 'closed before tool call',
          } as WebSocket.CloseEvent);
          simulateFunctionCallMessage(mockWs, [
            { name: 'lateFunction', args: { value: 'late' }, id: 'function-call-late' },
          ]);
        });
      });
      return mockWs;
    });

    const response = await provider.callApi('test prompt');
    await flushAsyncEvents();
    await flushAsyncEvents();

    expect(response.error).toContain('WebSocket connection closed unexpectedly');
    expect(lateCallback).not.toHaveBeenCalled();

    const toolResponses = mockWs.send.mock.calls
      .map(([message]) => JSON.parse(message as string))
      .filter((message) => message.toolResponse);
    expect(toolResponses).toHaveLength(0);
  });

  it('should not fetch state when final message parsing resumes after close', async () => {
    const originalResponse = globalThis.Response;
    const responseConstructor = vi.fn(function (body: unknown) {
      return {
        text: vi.fn(async () => {
          const responseText = String(body);
          if (responseText.includes('"turnComplete":true')) {
            mockWs.onclose?.({
              wasClean: false,
              code: 1006,
              reason: 'closed while parsing final message',
            } as WebSocket.CloseEvent);
          }
          return responseText;
        }),
      };
    }) as unknown as typeof Response;
    vi.stubGlobal('Response', responseConstructor);

    try {
      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:5000',
          },
        },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ counter: 5 }),
      } as any);

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const response = await provider.callApi('test prompt');
      await flushAsyncEvents();

      expect(response.error).toContain('WebSocket connection closed unexpectedly');
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('Response', originalResponse);
    }
  });

  it('should throw an error if API key is not set', async () => {
    const providerWithoutKey = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
      },
    });

    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    const originalGeminiApiKey = process.env.GEMINI_API_KEY;
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    mockProcessEnv({ GEMINI_API_KEY: undefined });

    await expect(providerWithoutKey.callApi('test prompt')).rejects.toThrow(
      'Google authentication is not configured',
    );

    if (originalGoogleApiKey) {
      mockProcessEnv({ GOOGLE_API_KEY: originalGoogleApiKey });
    }
    if (originalGeminiApiKey) {
      mockProcessEnv({ GEMINI_API_KEY: originalGeminiApiKey });
    }
  });

  it('should handle function tool callbacks correctly', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: 'print(default_api.addNumbers(a=5, b=6))\n',
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-13767088400406609799' },
        ]);
        simulatePartsMessage(mockWs, [
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '{"sum": 11}\n' } },
        ]);
        simulateTextMessage(mockWs, 'The sum of 5 and 6 is 11.\n');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const mockAddNumbers = vi.fn().mockResolvedValue({ sum: 5 + 6 });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          addNumbers: mockAddNumbers,
        },
      },
    });

    const response = await provider.callApi('What is the sum of 5 and 6?');
    expect(response).toEqual({
      output: {
        text: 'The sum of 5 and 6 is 11.\n',
        toolCall: {
          functionCalls: [
            { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-13767088400406609799' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
    expect(mockAddNumbers).toHaveBeenCalledTimes(1);
    expect(mockAddNumbers).toHaveBeenCalledWith('{"a":5,"b":6}');
  });

  it('should handle errors in function tool callbacks', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          { executableCode: { language: 'PYTHON', code: 'print(default_api.errorFunction())\n' } },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'errorFunction', args: {}, id: 'function-call-7580472343952164416' },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: "{'error': 'Error executing function errorFunction: Error: Test error'}\n",
            },
          },
        ]);
        simulateTextMessage(
          mockWs,
          'The function `errorFunction` has been called and it returned an error as expected.',
        );
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });
    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'errorFunction',
                description: 'A function that always throws an error',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          errorFunction: () => {
            throw new Error('Test error');
          },
        },
      },
    });

    const response = await provider.callApi('Call the error function');
    expect(response).toEqual({
      output: {
        text: 'The function `errorFunction` has been called and it returned an error as expected.',
        toolCall: {
          functionCalls: [
            { name: 'errorFunction', args: {}, id: 'function-call-7580472343952164416' },
          ],
        },
        statefulApiState: undefined,
      },
      metadata: {},
    });
  });

  it('should skip tool side effects when tools are disabled', async () => {
    const mockSpawn = vi.mocked((await import('child_process')).spawn);
    // Tests run in random order; a prior test may have invoked spawn through
    // module-mocked code paths whose deferred work is not drained by the
    // describe-level afterEach. Clear here so this test only sees spawn calls
    // from its own provider invocation.
    mockSpawn.mockClear();
    mockFetchWithProxy.mockClear();
    mockImportModule.mockReset();

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tool_choice: 'none',
        tools: 'file://tools.js:getTools',
        functionToolStatefulApi: {
          file: 'examples/google-live/counter_api.py',
          url: 'http://127.0.0.1:8765',
        },
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setImmediate(() => {
          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        });
      });
      return mockWs;
    });

    await provider.callApi('Do not use tools');

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
    expect(sentMessage.setup.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(sentMessage.setup.tools).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockImportModule).not.toHaveBeenCalled();
    expect(mockFetchWithProxy).not.toHaveBeenCalled();
  });

  it('should preserve inline non-function tools in arrays containing file:// references when disabled', async () => {
    const mockSpawn = vi.mocked((await import('child_process')).spawn);
    mockSpawn.mockClear();
    mockImportModule.mockReset();

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tool_choice: 'none',
        // Mixed array: an inline tool and a file:// reference. Without the
        // recursive guard, maybeLoadToolsFromExternalFile would still execute
        // the JS module to load tool definitions.
        tools: [{ googleSearch: {} }, 'file://tools.js:getTools'] as any,
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setImmediate(() => {
          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        });
      });
      return mockWs;
    });

    await provider.callApi('Do not use tools');

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
    expect(sentMessage.setup.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(sentMessage.setup.tools).toEqual([{ googleSearch: {} }]);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockImportModule).not.toHaveBeenCalled();
  });

  it('should preserve non-function tools when function calling is disabled', async () => {
    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tool_choice: 'none',
        tools: [{ googleSearch: {} }],
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        setImmediate(() => {
          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        });
      });
      return mockWs;
    });

    await provider.callApi('Use search but no functions');

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
    expect(sentMessage.setup.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(sentMessage.setup.tools).toEqual([{ googleSearch: {} }]);
  });

  it('should honor prompt-level disabled-tool overrides', async () => {
    const mockAddNumbers = vi.fn().mockResolvedValue({ sum: 11 });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        tools: [
          {
            functionDeclarations: [
              {
                name: 'addNumbers',
                description: 'Add two numbers together',
              },
            ],
          },
        ],
        functionToolCallbacks: {
          addNumbers: mockAddNumbers,
        },
      },
    });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateFunctionCallMessage(mockWs, [
          { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-disabled' },
        ]);
        simulateTextMessage(mockWs, 'No tools were used.');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    await provider.callApi('Do not use tools', {
      prompt: {
        config: {
          tool_choice: 'none',
        },
      },
    } as any);

    const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
    expect(sentMessage.setup.toolConfig).toEqual({ functionCallingConfig: { mode: 'NONE' } });
    expect(sentMessage.setup.tools).toBeUndefined();
    expect(mockAddNumbers).not.toHaveBeenCalled();

    // The provider should reply with an error tool_response so the model can
    // complete its turn instead of stalling until the websocket times out.
    const toolResponses = mockWs.send.mock.calls
      .map(([message]) => JSON.parse(message as string))
      .filter((m) => m.toolResponse);
    expect(toolResponses).toHaveLength(1);
    expect(toolResponses[0].toolResponse.functionResponses).toEqual([
      {
        id: 'function-call-disabled',
        name: 'addNumbers',
        response: { error: 'Tool calls are disabled for this request.' },
      },
    ]);
  });

  it('should execute prompt-level function callbacks', async () => {
    const promptAddNumbers = vi.fn().mockResolvedValue({ sum: 11 });

    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulateFunctionCallMessage(mockWs, [
          { name: 'addNumbers', args: { a: 5, b: 6 }, id: 'function-call-prompt-level' },
        ]);
        simulateTextMessage(mockWs, 'The sum is 11.');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    const response = await provider.callApi('What is the sum?', {
      prompt: {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'addNumbers',
                  description: 'Add two numbers together',
                },
              ],
            },
          ],
          functionToolCallbacks: {
            addNumbers: promptAddNumbers,
          },
        },
      },
    } as any);

    expect(promptAddNumbers).toHaveBeenCalledWith('{"a":5,"b":6}');
    const toolResponses = mockWs.send.mock.calls
      .map(([message]) => JSON.parse(message as string))
      .filter((message) => message.toolResponse);
    expect(toolResponses[0].toolResponse.functionResponses).toEqual([
      { id: 'function-call-prompt-level', name: 'addNumbers', response: { sum: 11 } },
    ]);
    expect(response.output).toEqual(
      expect.objectContaining({
        text: 'The sum is 11.',
      }),
    );
  });

  it('should handle function tool calls to a spawned stateful api', async () => {
    vi.mocked(WebSocket).mockImplementation(function () {
      setImmediate(() => {
        mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
        simulateSetupMessage(mockWs);
        simulatePartsMessage(mockWs, [
          {
            executableCode: {
              language: 'PYTHON',
              code: dedent`
                while True:
                  count_response = default_api.get_count()
                  if count_response and count_response.counter is not None and count_response.counter >= 5:
                    print(f"Counter reached {count_response.counter}, stopping.")
                    break
                  default_api.add_one()
                  print("Counter incremented.")
              `,
            },
          },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-809368982256348430' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'add_one', args: {}, id: 'function-call-7991972082416923583' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-2287351185126351207' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'add_one', args: {}, id: 'function-call-4023509897900237366' },
        ]);
        simulateFunctionCallMessage(mockWs, [
          { name: 'get_count', args: {}, id: 'function-call-2287351185126351304' },
        ]);
        simulatePartsMessage(mockWs, [
          {
            codeExecutionResult: {
              outcome: 'OUTCOME_OK',
              output: 'Counter incremented.\nCounter incremented.\nCounter reached 5, stopping.\n',
            },
          },
        ]);
        simulateTextMessage(mockWs, 'The counter has been incremented until it reached 5.\n');
        simulateCompletionMessage(mockWs);
      });
      return mockWs;
    });

    provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
      config: {
        generationConfig: {
          response_modalities: ['text'],
        },
        timeoutMs: 500,
        apiKey: 'test-api-key',
        functionToolStatefulApi: {
          file: 'examples/google-live/counter_api.py',
          url: 'http://127.0.0.1:5000',
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'add_one',
                description: 'add one to counter',
              },
              {
                name: 'get_count',
                description: 'return the current value of the counter',
                response: {
                  type: 'OBJECT',
                  properties: {
                    counter: {
                      type: 'INTEGER',
                      description: 'value of counter',
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    });

    // Mock fetchWithProxy to return successful responses
    mockFetchWithProxy.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ counter: 5 }),
    } as any);

    const response = await provider.callApi('Add to the counter until it reaches 5');
    expect(response).toEqual({
      output: {
        text: 'The counter has been incremented until it reached 5.\n',
        toolCall: {
          functionCalls: [
            { name: 'get_count', args: {}, id: 'function-call-809368982256348430' },
            { name: 'add_one', args: {}, id: 'function-call-7991972082416923583' },
            { name: 'get_count', args: {}, id: 'function-call-2287351185126351207' },
            { name: 'add_one', args: {}, id: 'function-call-4023509897900237366' },
            { name: 'get_count', args: {}, id: 'function-call-2287351185126351304' },
          ],
        },
        statefulApiState: { counter: 5 },
      },
      metadata: {},
    });

    const statefulApiUrls = mockFetchWithProxy.mock.calls
      .map((call) => call[0] as string)
      .filter((url) => url.startsWith('http://127.0.0.1:5000/'));
    expect(statefulApiUrls).toEqual([
      'http://127.0.0.1:5000/get_count',
      'http://127.0.0.1:5000/add_one',
      'http://127.0.0.1:5000/get_count',
      'http://127.0.0.1:5000/add_one',
      'http://127.0.0.1:5000/get_count',
      'http://127.0.0.1:5000/get_state',
    ]);

    const functionCallUrls = statefulApiUrls.filter(
      (url) => url !== 'http://127.0.0.1:5000/get_state',
    );
    const addOneCalls = functionCallUrls.filter((url) => url === 'http://127.0.0.1:5000/add_one');
    const getCountCalls = functionCallUrls.filter(
      (url) => url === 'http://127.0.0.1:5000/get_count',
    );

    expect(addOneCalls.length).toBe(2);
    expect(getCountCalls.length).toBe(3);
  });
  describe('Python executable integration', () => {
    it('should handle Python executable validation correctly', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );

      validatePythonPathMock.mockResolvedValueOnce('/custom/python/bin');

      const providerWithCustomPython = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
            pythonExecutable: '/custom/python/path',
          },
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      await providerWithCustomPython.callApi('Test prompt');

      expect(validatePythonPathMock).toHaveBeenCalledWith('/custom/python/path', true);

      expect(mockSpawn).toHaveBeenCalledWith('/custom/python/bin', [
        'examples/google-live/counter_api.py',
      ]);
    });

    it('should handle errors when spawning Python process', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      mockSpawn.mockClear();
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );

      validatePythonPathMock.mockRejectedValueOnce(new Error('Python not found'));

      const originalError = console.error;
      const mockError = vi.fn();
      console.error = mockError;

      try {
        const providerWithPythonError = new GoogleLiveProvider('gemini-2.0-flash-exp', {
          config: {
            generationConfig: {
              response_modalities: ['text'],
            },
            timeoutMs: 500,
            apiKey: 'test-api-key',
            functionToolStatefulApi: {
              file: 'examples/google-live/counter_api.py',
              url: 'http://127.0.0.1:8765',
            },
          },
        });

        vi.mocked(WebSocket).mockImplementation(function () {
          setImmediate(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          });
          return mockWs;
        });

        await providerWithPythonError.callApi('Test prompt');

        expect(mockSpawn).not.toHaveBeenCalled();
      } finally {
        console.error = originalError;
      }
    });

    it('should handle stdout and stderr from the Python process', async () => {
      const mockSpawn = vi.mocked((await import('child_process')).spawn);

      const mockStdout = { on: vi.fn() };
      const mockStderr = { on: vi.fn() };

      mockSpawn.mockReturnValueOnce({
        stdout: mockStdout,
        stderr: mockStderr,
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      } as any);

      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
      validatePythonPathMock.mockResolvedValueOnce('python3');

      const providerWithStatefulApi = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
          },
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      await providerWithStatefulApi.callApi('Test prompt');

      expect(mockStdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockStderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should use the PROMPTFOO_PYTHON env variable when available', async () => {
      const originalEnv = process.env.PROMPTFOO_PYTHON;
      mockProcessEnv({ PROMPTFOO_PYTHON: '/env/python3' });

      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
      validatePythonPathMock.mockResolvedValueOnce('/env/python3');

      try {
        const providerWithEnvPython = new GoogleLiveProvider('gemini-2.0-flash-exp', {
          config: {
            generationConfig: {
              response_modalities: ['text'],
            },
            timeoutMs: 500,
            apiKey: 'test-api-key',
            functionToolStatefulApi: {
              file: 'examples/google-live/counter_api.py',
              url: 'http://127.0.0.1:8765',
            },
          },
        });

        vi.mocked(WebSocket).mockImplementation(function () {
          setImmediate(() => {
            mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
            simulateSetupMessage(mockWs);
            simulateTextMessage(mockWs, 'Test response');
            simulateCompletionMessage(mockWs);
          });
          return mockWs;
        });

        await providerWithEnvPython.callApi('Test prompt');

        expect(validatePythonPathMock).toHaveBeenCalledWith('/env/python3', true);

        expect(mockSpawn).toHaveBeenCalledWith('/env/python3', [
          'examples/google-live/counter_api.py',
        ]);
      } finally {
        if (originalEnv) {
          mockProcessEnv({ PROMPTFOO_PYTHON: originalEnv });
        } else {
          mockProcessEnv({ PROMPTFOO_PYTHON: undefined });
        }
      }
    });

    it('should properly clean up Python process on WebSocket close', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };

      const mockSpawn = vi.mocked((await import('child_process')).spawn);
      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const validatePythonPathMock = vi.mocked(
        (await import('../../../src/python/pythonUtils')).validatePythonPath,
      );
      validatePythonPathMock.mockResolvedValueOnce('python3');

      const providerWithCleanup = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: {
            response_modalities: ['text'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          functionToolStatefulApi: {
            file: 'examples/google-live/counter_api.py',
            url: 'http://127.0.0.1:8765',
          },
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateTextMessage(mockWs, 'Test response');
          simulateCompletionMessage(mockWs);

          mockWs.onclose?.({ wasClean: true, code: 1000 } as WebSocket.CloseEvent);
        });
        return mockWs;
      });

      await providerWithCleanup.callApi('Test prompt');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('Audio configurations', () => {
    it('should correctly format proactivity configuration', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            proactivity: {
              proactiveAudio: true,
            },
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"proactivity":{"proactive_audio":true}'),
      );
    });

    it('should correctly format enableAffectiveDialog configuration', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-native-audio-thinking-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            enableAffectiveDialog: true,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"enable_affective_dialog":true'),
      );
    });

    it('should correctly format outputAudioTranscription configuration', async () => {
      const transcriptionConfig = {
        includeTextualContent: true,
        language: 'en-US',
      };

      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
            outputAudioTranscription: transcriptionConfig,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining(
          '"output_audio_transcription":{"includeTextualContent":true,"language":"en-US"}',
        ),
      );
    });

    it('should correctly format inputAudioTranscription configuration', async () => {
      const transcriptionConfig = {
        autoDetectLanguage: true,
      };

      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
            inputAudioTranscription: transcriptionConfig,
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"input_audio_transcription":{"autoDetectLanguage":true}'),
      );
    });

    it('should handle all audio configurations together', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          apiVersion: 'v1alpha',
          generationConfig: {
            response_modalities: ['audio'],
            proactivity: {
              proactiveAudio: true,
            },
            enableAffectiveDialog: true,
            outputAudioTranscription: {
              includeTextualContent: true,
            },
            inputAudioTranscription: {
              autoDetectLanguage: true,
            },
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      const generationConfig = sentMessage.setup.generation_config;

      expect(generationConfig.proactivity).toEqual({ proactive_audio: true });
      expect(generationConfig.enable_affective_dialog).toBe(true);
      expect(sentMessage.setup.output_audio_transcription).toEqual({ includeTextualContent: true });
      expect(sentMessage.setup.input_audio_transcription).toEqual({ autoDetectLanguage: true });
    });

    it('should not include audio configurations when they are not specified', async () => {
      provider = new GoogleLiveProvider('gemini-2.5-flash-preview-native-audio-dialog', {
        config: {
          generationConfig: {
            response_modalities: ['audio'],
          },
          timeoutMs: 500,
          apiKey: 'test-api-key',
        },
      });

      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          // Trigger onclose immediately to resolve the promise
          setImmediate(() => {
            mockWs.onclose?.({
              wasClean: true,
              code: 1000,
              reason: 'Test close',
            } as WebSocket.CloseEvent);
          });
        });
        return mockWs;
      });

      await provider.callApi('test prompt');

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      const generationConfig = sentMessage.setup.generation_config;

      expect(generationConfig.proactivity).toBeUndefined();
      expect(generationConfig.enable_affective_dialog).toBeUndefined();
      expect(generationConfig.output_audio_transcription).toBeUndefined();
      expect(generationConfig.input_audio_transcription).toBeUndefined();
    });
  });

  describe('External Function Callbacks', () => {
    beforeEach(() => {
      // Set cliState basePath for external function loading
      cliState.basePath = '/test/base/path';
    });

    afterEach(() => {
      vi.clearAllMocks();
      cliState.basePath = undefined;
    });

    it('should load and execute external function callbacks from file', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'external_function', args: { param: 'test_value' }, id: 'function-call-ext-1' },
          ]);
          simulateTextMessage(mockWs, 'External function result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Mock importModule to return our test function
      const mockExternalFunction = vi.fn().mockResolvedValue('External function result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { param: { type: 'STRING' } },
                    required: ['param'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            external_function: 'file://test/callbacks.js:testFunction',
          },
        },
      });

      const response = await provider.callApi('Call external function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'test/callbacks.js'),
        'testFunction',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param":"test_value"}');
      expect(response.output.text).toBe('External function result');
    });

    it('should load external function callbacks from Windows-style file paths', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'external_function', args: { param: 'test_value' }, id: 'function-call-win-1' },
          ]);
          simulateTextMessage(mockWs, 'Windows result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const mockExternalFunction = vi.fn().mockResolvedValue('Windows result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { param: { type: 'STRING' } },
                    required: ['param'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            external_function: 'file://C:/test/callbacks.js:testFunction',
          },
        },
      });

      const response = await provider.callApi('Call external function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'C:/test/callbacks.js'),
        'testFunction',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param":"test_value"}');
      expect(response.output.text).toBe('Windows result');
    });

    it('should cache external functions and not reload them on subsequent calls', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'cached_function', args: { value: 123 }, id: 'function-call-cache-1' },
          ]);
          simulateTextMessage(mockWs, 'Cached result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const mockCachedFunction = vi.fn().mockResolvedValue('Cached result');
      mockImportModule.mockResolvedValue(mockCachedFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'cached_function',
                  description: 'A cached function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { value: { type: 'NUMBER' } },
                    required: ['value'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            cached_function: 'file://callbacks/cache-test.js:cachedFunction',
          },
        },
      });

      // First call - should load the function
      const result1 = await provider.callApi('First call');
      expect(mockImportModule).toHaveBeenCalledTimes(1);
      expect(mockCachedFunction).toHaveBeenCalledWith('{"value":123}');
      expect(result1.output.text).toBe('Cached result');

      // Reset WebSocket mock for second call
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'cached_function', args: { value: 456 }, id: 'function-call-cache-2' },
          ]);
          simulateTextMessage(mockWs, 'Cached result');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Second call - should use cached function, not reload
      const result2 = await provider.callApi('Second call');
      expect(mockImportModule).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(mockCachedFunction).toHaveBeenCalledTimes(2);
      expect(result2.output.text).toBe('Cached result');
    });

    it('should handle errors in external function loading gracefully', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'error_function', args: { test: 'data' }, id: 'function-call-error-1' },
          ]);
          simulateTextMessage(mockWs, 'Function failed gracefully');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      // Mock import module to throw an error
      mockImportModule.mockRejectedValue(new Error('Module not found'));

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'error_function',
                  description: 'A function that errors during loading',
                  parameters: {
                    type: 'OBJECT',
                    properties: { test: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            error_function: 'file://nonexistent/module.js:errorFunction',
          },
        },
      });

      const response = await provider.callApi('Call error function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'nonexistent/module.js'),
        'errorFunction',
      );
      // Should continue with normal flow despite error
      expect(response.output.text).toBe('Function failed gracefully');
    });

    it('should handle mixed inline and external function callbacks', async () => {
      vi.mocked(WebSocket).mockImplementation(function () {
        setImmediate(() => {
          mockWs.onopen?.({ type: 'open', target: mockWs } as WebSocket.Event);
          simulateSetupMessage(mockWs);
          simulateFunctionCallMessage(mockWs, [
            { name: 'inline_function', args: { inline: 'test' }, id: 'function-call-inline-1' },
            {
              name: 'external_function',
              args: { external: 'test' },
              id: 'function-call-external-1',
            },
          ]);
          simulateTextMessage(mockWs, 'Mixed functions completed');
          simulateCompletionMessage(mockWs);
        });
        return mockWs;
      });

      const mockInlineFunction = vi.fn().mockResolvedValue('Inline result');
      const mockExternalFunction = vi.fn().mockResolvedValue('External result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
        config: {
          generationConfig: { response_modalities: ['text'] },
          timeoutMs: 500,
          apiKey: 'test-api-key',
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'inline_function',
                  description: 'An inline function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { inline: { type: 'STRING' } },
                  },
                },
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { external: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            inline_function: mockInlineFunction,
            external_function: 'file://mixed/callbacks.js:externalFunc',
          },
        },
      });

      const response = await provider.callApi('Test mixed callbacks');

      expect(mockInlineFunction).toHaveBeenCalledWith('{"inline":"test"}');
      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'mixed/callbacks.js'),
        'externalFunc',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"external":"test"}');
      expect(response.output.text).toBe('Mixed functions completed');
    });
  });

  describe('fetchJson', () => {
    it('should successfully fetch and parse JSON', async () => {
      const mockData = { success: true, data: 'test data' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await fetchJson('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass options to fetchWithProxy', async () => {
      const mockData = { result: 'success' };
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
      };

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await fetchJson('https://example.com/api', options);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', options);
      expect(result).toEqual(mockData);
    });

    it('should throw error when response is not ok', async () => {
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn(),
      } as any);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow(
        'HTTP error - status: 404',
      );
    });

    it('should throw error with status 500', async () => {
      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn(),
      } as any);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow(
        'HTTP error - status: 500',
      );
    });

    it('should propagate network errors', async () => {
      const networkError = new Error('Network failure');
      mockFetchWithProxy.mockRejectedValue(networkError);

      await expect(fetchJson('https://example.com/api')).rejects.toThrow('Network failure');
    });
  });

  describe('tryGetThenPost', () => {
    it('should successfully fetch with GET when no data provided', async () => {
      const mockData = { result: 'success' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://example.com/api', undefined);
      expect(result).toEqual(mockData);
    });

    it('should successfully fetch with GET when data is provided as object', async () => {
      const mockData = { result: 'success' };
      const data = { param1: 'value1', param2: 'value2' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://example.com/api?param1=value1&param2=value2',
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should successfully fetch with GET when data is provided as string', async () => {
      const mockData = { result: 'success' };
      const data = '{"param1":"value1","param2":"value2"}';
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://example.com/api?param1=value1&param2=value2',
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should fallback to POST when GET fails', async () => {
      const mockData = { result: 'success via POST' };
      const data = { param1: 'value1' };

      // First call (GET) fails
      mockFetchWithProxy
        .mockRejectedValueOnce(new Error('GET failed'))
        // Second call (POST) succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      // First call with GET
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(
        1,
        'https://example.com/api?param1=value1',
        undefined,
      );
      // Second call with POST
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      expect(result).toEqual(mockData);
    });

    it('should fallback to POST when GET returns non-ok response', async () => {
      const mockData = { result: 'success via POST' };
      const data = { param1: 'value1' };

      // First call (GET) returns 404
      mockFetchWithProxy
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: vi.fn(),
        } as any)
        // Second call (POST) succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockData),
        } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      expect(result).toEqual(mockData);
    });

    it('should handle POST with string data', async () => {
      const mockData = { result: 'success' };
      const data = '{"param1":"value1"}';

      mockFetchWithProxy.mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data,
      });
      expect(result).toEqual(mockData);
    });

    it('should handle POST with no data', async () => {
      const mockData = { result: 'success' };

      mockFetchWithProxy.mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api');

      expect(mockFetchWithProxy).toHaveBeenNthCalledWith(2, 'https://example.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: null,
      });
      expect(result).toEqual(mockData);
    });

    it('should handle complex query parameters in GET', async () => {
      const mockData = { result: 'success' };
      const data = {
        param1: 'value with spaces',
        param2: 123,
        param3: true,
        param4: 'special&chars=test',
      };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      } as any);

      const result = await tryGetThenPost('https://example.com/api', data);

      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetchWithProxy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('param1=value+with+spaces');
      expect(calledUrl).toContain('param2=123');
      expect(calledUrl).toContain('param3=true');
      expect(result).toEqual(mockData);
    });

    it('should throw error when both GET and POST fail', async () => {
      const data = { param1: 'value1' };

      mockFetchWithProxy
        .mockRejectedValueOnce(new Error('GET failed'))
        .mockRejectedValueOnce(new Error('POST failed'));

      await expect(tryGetThenPost('https://example.com/api', data)).rejects.toThrow('POST failed');
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
    });
  });
});
