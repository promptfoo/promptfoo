import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import logger from '../../../src/logger';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { GoogleLiveProvider } from '../../../src/providers/google/live';
import { VertexLiveProvider } from '../../../src/providers/google/vertexLive';
import { loadApiProvider } from '../../../src/providers/index';
import { TestProviderRequestSchema } from '../../../src/types/api/providers';
import { TestSuiteConfigSchema } from '../../../src/types/index';
import { ProviderOptionsSchema } from '../../../src/validators/providers';
import { mockProcessEnv } from '../../util/utils';

import type { CallApiContextParams, ProviderOptions } from '../../../src/types/index';

vi.mock('ws');
vi.mock('../../../src/providers/google/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/providers/google/auth')>();
  return {
    ...original,
    GoogleAuthManager: { ...original.GoogleAuthManager, getOAuthClient: vi.fn() },
  };
});

describe('VertexLiveProvider', () => {
  const model = 'gemini-live-2.5-flash-native-audio';
  const extendedModel = 'gemini-3.8-live-extended-thinking';
  const mockAuth = vi.mocked(GoogleAuthManager.getOAuthClient);
  const getRequestHeaders = vi.fn();
  let ws: WebSocket;
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      GOOGLE_API_KEY: 'gemini-key-must-not-be-used',
      VERTEX_API_KEY: 'vertex-key-must-not-be-used',
      VERTEX_PROJECT_ID: '',
      GOOGLE_PROJECT_ID: '',
      GOOGLE_CLOUD_PROJECT: '',
      VERTEX_REGION: '',
      GOOGLE_CLOUD_LOCATION: '',
      VERTEX_API_VERSION: '',
    });
    vi.resetAllMocks();
    vi.useFakeTimers();
    getRequestHeaders.mockResolvedValue(
      new Headers({ authorization: 'Bearer oauth-token', 'x-goog-user-project': 'quota-project' }),
    );
    mockAuth.mockResolvedValue({ client: { getRequestHeaders }, projectId: 'adc-project' });
    ws = { send: vi.fn(), close: vi.fn(), readyState: WebSocket.OPEN } as unknown as WebSocket;
    vi.mocked(WebSocket).mockImplementation(function () {
      return ws;
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const emit = async (message: object) => {
    await ws.onmessage?.({ data: JSON.stringify(message) } as WebSocket.MessageEvent);
  };
  const sent = () => vi.mocked(ws.send).mock.calls.map(([message]) => JSON.parse(String(message)));
  const start = async (
    provider: GoogleLiveProvider,
    prompt = 'Say hello.',
    context?: CallApiContextParams,
  ) => {
    const result = provider.callApi(prompt, context);
    await vi.waitFor(() => expect(ws.onopen).toBeTypeOf('function'));
    ws.onopen?.({} as WebSocket.Event);
    await emit({ setupComplete: {} });
    return { result };
  };
  const complete = () =>
    emit({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: 'AAAAAA==' } }] },
        outputTranscription: { text: 'Hello' },
        turnComplete: true,
        interactionStatus: 'IDLE',
      },
    });

  it.each([model, 'gemini-3.8-live', extendedModel])(
    'connects %s to Vertex with OAuth headers, audio, and a transcript',
    async (modelName) => {
      const provider = new VertexLiveProvider(modelName, { config: { projectId: 'my-project' } });
      expect(provider.id()).toBe(`vertex:live:${modelName}`);
      expect(provider.toString()).toContain('Vertex Live');
      const { result } = await start(provider);
      expect(WebSocket).toHaveBeenCalledWith(
        'wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent',
        {
          headers: { authorization: 'Bearer oauth-token', 'x-goog-user-project': 'quota-project' },
        },
      );
      expect(sent()[0]).toMatchObject({
        setup: {
          model: `projects/my-project/locations/us-central1/publishers/google/models/${modelName}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          outputAudioTranscription: {},
        },
      });
      expect(sent()[1]).toEqual(
        modelName === model
          ? {
              clientContent: {
                turns: [{ role: 'user', parts: [{ text: 'Say hello.' }] }],
                turnComplete: true,
              },
            }
          : { realtimeInput: { text: 'Say hello.' } },
      );
      await complete();
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.output).toMatchObject({ text: 'Hello' });
      expect(response.audio?.data).toBeTruthy();
      expect(ws.close).toHaveBeenCalled();
    },
  );

  it.each([
    ['gemini-robotics-er-2-streaming-preview', 'v1'],
    ['gemini-robotics-er-2-streaming-preview', 'v1beta1'],
    ['gemini-3.5-live-translate-preview', 'v1'],
    ['gemini-3.5-live-translate-preview', 'v1beta1'],
  ])('accepts the Vertex API version for %s on %s', async (modelName, apiVersion) => {
    const isTranslation = modelName === 'gemini-3.5-live-translate-preview';
    const provider = new VertexLiveProvider(modelName, {
      config: {
        apiVersion,
        generationConfig: isTranslation
          ? { translationConfig: { targetLanguageCode: 'en' } }
          : { responseModalities: ['TEXT'] },
      },
    });
    const prompt = isTranslation
      ? JSON.stringify([
          {
            role: 'user',
            parts: [{ inline_data: { mime_type: 'audio/pcm;rate=16000', data: 'AAAAAA==' } }],
          },
        ])
      : 'Say hello.';
    const { result } = await start(provider, prompt);
    expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain(`aiplatform.${apiVersion}.`);
    expect(sent()[0].setup.model).toContain(`/models/${modelName}`);
    await emit({
      serverContent: {
        modelTurn: { parts: [{ text: 'Hello' }] },
        turnComplete: true,
      },
    });
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.output).toMatchObject({ text: 'Hello' });
    expect(ws.close).toHaveBeenCalled();
  });

  it.each([
    [{ env: { VERTEX_API_VERSION: 'v1beta1' } }, 'v1', 'v1beta1'],
    [{}, 'v1beta1', 'v1beta1'],
    [{ config: { apiVersion: 'v1' }, env: { VERTEX_API_VERSION: 'v1beta1' } }, 'v1beta1', 'v1'],
    [{ env: { VERTEX_API_VERSION: '' } }, 'v1beta1', 'v1'],
  ] as const)(
    'resolves the API version from %j with process version %s',
    async (options, processVersion, apiVersion) => {
      const restoreVersion = mockProcessEnv({ VERTEX_API_VERSION: processVersion });
      try {
        const { result } = await start(new VertexLiveProvider(model, options as ProviderOptions));
        expect(vi.mocked(WebSocket).mock.calls[0][0]).toBe(
          `wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.${apiVersion}.LlmBidiService/BidiGenerateContent`,
        );
        await complete();
        expect((await result).error).toBeUndefined();
      } finally {
        restoreVersion();
      }
    },
  );

  it.each([
    [{ config: { projectId: 'explicit', region: 'europe-west4' } }, 'explicit', 'europe-west4'],
    [
      { env: { VERTEX_PROJECT_ID: 'vertex-env', VERTEX_REGION: 'us-east4' } },
      'vertex-env',
      'us-east4',
    ],
    [{ env: { GOOGLE_PROJECT_ID: 'google-env' } }, 'google-env', 'us-central1'],
    [
      { env: { GOOGLE_CLOUD_PROJECT: 'sdk-env', GOOGLE_CLOUD_LOCATION: 'us-west1' } },
      'sdk-env',
      'us-west1',
    ],
    [{}, 'adc-project', 'us-central1'],
    [{ config: { region: 'global', apiVersion: 'v1beta1' } }, 'adc-project', 'global'],
  ] as const)('resolves project and location for %j', async (options, project, region) => {
    const { result } = await start(new VertexLiveProvider(model, options as ProviderOptions));
    expect(sent()[0].setup.model).toBe(
      `projects/${project}/locations/${region}/publishers/google/models/${model}`,
    );
    const host =
      region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`;
    expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain(`wss://${host}/`);
    if (region === 'global') {
      expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain('aiplatform.v1beta1.');
    }
    await complete();
    await result;
  });

  it('uses the Vertex multi-region endpoint for Gemini Live in the EU', async () => {
    const { result } = await start(
      new VertexLiveProvider('gemini-3.8-live', { config: { region: 'eu' } }),
    );
    expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain(
      'wss://aiplatform.eu.rep.googleapis.com/',
    );
    expect(sent()[0].setup.model).toContain('/locations/eu/');
    await complete();
    await result;
  });

  const liveTranscribe = 'gemini-3.5-transcribe-live';
  const recording = JSON.stringify([
    {
      role: 'user',
      parts: [{ inlineData: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } }],
    },
  ]);

  it.each([
    [
      'google',
      'generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.',
      `models/${liveTranscribe}`,
    ],
    [
      'vertex',
      'aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.',
      `projects/adc-project/locations/global/publishers/google/models/${liveTranscribe}`,
    ],
  ] as const)('grades only committed speech on %s', async (prefix, endpoint, modelId) => {
    const config = {
      generationConfig: { inputAudioTranscription: { languageCodes: ['en-US'] } },
    };
    const provider =
      prefix === 'vertex'
        ? new VertexLiveProvider(liveTranscribe, { config })
        : new GoogleLiveProvider(liveTranscribe, { config: { ...config, apiKey: 'test-key' } });
    const { result } = await start(provider, recording);
    expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain(endpoint);
    expect(sent()).toEqual([
      {
        setup: {
          model: modelId,
          generationConfig: { responseModalities: ['TEXT'] },
          inputAudioTranscription: { languageCodes: ['en-US'] },
        },
      },
      { realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } } },
      { realtimeInput: { audioStreamEnd: true } },
    ]);
    await emit({ serverContent: { interimInputTranscription: { text: 'draft' } } });
    await emit({ serverContent: { inputTranscription: { text: 'First segment.' } } });
    await emit({
      serverContent: {
        inputTranscription: { text: 'Second segment.' },
        turnComplete: prefix === 'vertex',
      },
      usageMetadata: { promptTokenCount: 100, responseTokenCount: 10, totalTokenCount: 110 },
    });
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(result).resolves.toMatchObject({
      output: { text: 'First segment.\nSecond segment.' },
      cost: expect.closeTo((3.5 * 100 + 21 * 10) / 1e6, 10),
    });
  });

  describe.each(['google', 'vertex'])('%s Live transcription', (prefix) => {
    const startTranscription = (prompt = recording) =>
      start(
        prefix === 'vertex'
          ? new VertexLiveProvider(liveTranscribe, {})
          : new GoogleLiveProvider(liveTranscribe, { config: { apiKey: 'test-key' } }),
        prompt,
      );
    const twoRecordings = JSON.stringify([...JSON.parse(recording), ...JSON.parse(recording)]);
    const turnComplete = { serverContent: { turnComplete: true, interactionStatus: 'IDLE' } };
    const interim = { serverContent: { interimInputTranscription: { text: 'draft' } } };
    const transcript = (text: string) => ({ serverContent: { inputTranscription: { text } } });

    it.each([0, 1, 2])(
      'retains all speech when turnComplete follows %i segments',
      async (after) => {
        const { result } = await startTranscription();
        const frames: object[] = [transcript('First segment.'), transcript('Second segment.')];
        frames.splice(after, 0, turnComplete);
        for (const frame of frames) {
          await emit(frame);
        }
        await vi.advanceTimersByTimeAsync(4_000);
        await expect(result).resolves.toMatchObject({
          output: { text: 'First segment.\nSecond segment.' },
        });
        expect(ws.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['silence', 'trailing speech'])(
      'waits for %s before sending the next recording',
      async (first) => {
        const { result } = await startTranscription(twoRecordings);
        await emit(turnComplete);
        expect(sent()).toHaveLength(3);
        if (first === 'trailing speech') {
          await emit(transcript('First recording.'));
        }
        await vi.advanceTimersByTimeAsync(4_000);
        expect(sent().slice(3)).toEqual([
          { realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } } },
          { realtimeInput: { audioStreamEnd: true } },
        ]);
        await emit(turnComplete);
        await emit(transcript('Second recording.'));
        await vi.advanceTimersByTimeAsync(4_000);
        const text =
          first === 'silence' ? 'Second recording.' : 'First recording.\nSecond recording.';
        await expect(result).resolves.toMatchObject({ output: { text } });
        expect(sent()).toHaveLength(5);
        expect(ws.close).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      { frames: [interim, turnComplete], final: 'Final speech.' },
      { frames: [turnComplete, interim], final: 'Final speech.' },
      { frames: [interim, turnComplete], final: '' },
    ])("waits for final transcript '$final' after $frames", async ({ frames, final }) => {
      const { result } = await startTranscription();
      for (const frame of frames) {
        await emit(frame);
      }
      await vi.advanceTimersByTimeAsync(4_000);
      expect(ws.close).not.toHaveBeenCalled();
      await emit(turnComplete);
      await vi.advanceTimersByTimeAsync(4_000);
      expect(ws.close).not.toHaveBeenCalled();
      await emit(transcript(final));
      await vi.advanceTimersByTimeAsync(4_000);
      await expect(result).resolves.toMatchObject({ output: { text: final } });
    });

    it('extends the completion grace for trailing finalized speech', async () => {
      const { result } = await startTranscription();
      await emit(turnComplete);
      await vi.advanceTimersByTimeAsync(3_000);
      await emit(transcript('Final speech.'));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(ws.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(result).resolves.toMatchObject({ output: { text: 'Final speech.' } });
    });

    it.each([
      { scenario: 'speech', frames: [transcript('Hello'), turnComplete], expected: 'Hello' },
      {
        scenario: 'trailing speech',
        frames: [turnComplete, transcript('Hello')],
        expected: 'Hello',
      },
      { scenario: 'silence', frames: [turnComplete], expected: '' },
    ])(
      'finishes $scenario when the peer closes normally during the grace period',
      async ({ frames, expected }) => {
        const { result } = await startTranscription();
        // A socket may deliver several frames and close before their async handlers run.
        for (const frame of frames) {
          void emit(frame);
        }
        Object.assign(ws, { readyState: WebSocket.CLOSED });
        ws.onclose?.({ code: 1000, wasClean: true } as WebSocket.CloseEvent);
        await expect(result).resolves.toMatchObject({ output: { text: expected } });
        expect(ws.close).not.toHaveBeenCalled();
      },
    );

    it('requires a completion marker for the last recording on a normal close', async () => {
      const { result } = await startTranscription(twoRecordings);
      await emit(turnComplete);
      await vi.advanceTimersByTimeAsync(4_000);
      await emit(transcript('Second recording.'));
      ws.onclose?.({ code: 1000, wasClean: true } as WebSocket.CloseEvent);
      await expect(result).resolves.toMatchObject({
        error: expect.stringContaining('closed unexpectedly'),
      });
    });

    it.each([
      {
        scenario: 'missing completion',
        frames: [transcript('Hello')],
        code: 1000,
        prompt: recording,
      },
      {
        scenario: 'unfinished speech',
        frames: [turnComplete, interim],
        code: 1000,
        prompt: recording,
      },
      { scenario: 'unsent recording', frames: [turnComplete], code: 1000, prompt: twoRecordings },
      { scenario: 'server error', frames: [turnComplete], code: 1011, prompt: recording },
    ])('reports a peer close with $scenario', async ({ frames, code, prompt }) => {
      const { result } = await startTranscription(prompt);
      for (const frame of frames) {
        await emit(frame);
      }
      ws.onclose?.({ code, wasClean: true } as WebSocket.CloseEvent);
      await expect(result).resolves.toMatchObject({
        error: expect.stringContaining('closed unexpectedly'),
      });
    });
  });

  it.each([
    [
      {},
      'hello',
      'Gemini Live transcription requires raw 16-bit mono PCM audio at audio/pcm;rate=16000.',
    ],
    [
      { generationConfig: { responseModalities: ['AUDIO'] } },
      recording,
      'Gemini Live transcription requires the TEXT response modality.',
    ],
    [
      { generationConfig: { outputAudioTranscription: {} } },
      recording,
      'Gemini Live transcription produces text. Remove output audio transcription and speech settings.',
    ],
    [
      { systemInstruction: 'translate' },
      recording,
      'Gemini Live transcription accepts audio without tools or system instructions.',
    ],
    [
      { passthrough: { service_tier: 'flex' } },
      recording,
      'Gemini Live transcription supports only the Standard service tier.',
    ],
    [{ apiVersion: 'v1alpha' }, recording, 'Gemini Live transcription requires apiVersion v1beta.'],
  ])(
    'rejects unsupported transcription settings before opening a socket',
    async (config, prompt, error) => {
      const provider = new GoogleLiveProvider(liveTranscribe, {
        config: { apiKey: 'test-key', ...(config as ProviderOptions['config']) },
      });
      await expect(provider.callApi(prompt as string)).resolves.toEqual({ error });
      expect(WebSocket).not.toHaveBeenCalled();
    },
  );

  it('uses effective prompt config and forwards service-account auth options', async () => {
    const provider = new VertexLiveProvider(model, { config: { projectId: 'base-project' } });
    const { result } = await start(provider, 'Hello', {
      prompt: {
        raw: 'Hello',
        label: 'Hello',
        config: {
          projectId: 'override-project',
          region: 'us-east4',
          credentials: '{"type":"service_account"}',
          keyFilename: '/test/key.json',
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          googleAuthOptions: { quotaProjectId: 'billing-project' },
        },
      },
    } as CallApiContextParams);
    expect(mockAuth).toHaveBeenCalledWith({
      credentials: '{"type":"service_account"}',
      keyFilename: '/test/key.json',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      googleAuthOptions: { quotaProjectId: 'billing-project' },
    });
    expect(sent()[0].setup.model).toContain('projects/override-project/locations/us-east4/');
    await complete();
    await result;
  });

  it.each(['provider', 'suite', 'provider-test request'])(
    'preserves Google Cloud aliases through parsed %s config and provider loading',
    async (source) => {
      const id = `vertex:live:${model}`;
      const env = {
        GOOGLE_CLOUD_PROJECT: 'parsed-project',
        GOOGLE_CLOUD_LOCATION: 'europe-west4',
        VERTEX_API_VERSION: 'v1beta1',
      };
      const options =
        source === 'provider'
          ? ProviderOptionsSchema.parse({ id, env })
          : source === 'provider-test request'
            ? TestProviderRequestSchema.parse({ providerOptions: { id, env } }).providerOptions
            : {};
      const suiteEnv =
        source === 'suite'
          ? TestSuiteConfigSchema.parse({ prompts: ['Hello'], providers: [id], env }).env
          : undefined;
      const provider = await loadApiProvider(id, { options, env: suiteEnv });
      expect(provider).toBeInstanceOf(VertexLiveProvider);
      const { result } = await start(provider as VertexLiveProvider);
      const setup = sent()[0].setup;
      await complete();
      expect((await result).error).toBeUndefined();
      expect(setup.model).toBe(
        `projects/parsed-project/locations/europe-west4/publishers/google/models/${model}`,
      );
      expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain(
        'wss://europe-west4-aiplatform.googleapis.com/',
      );
      expect(vi.mocked(WebSocket).mock.calls[0][0]).toContain('aiplatform.v1beta1.');
    },
  );

  it('does not fall back to API keys when ADC is unavailable', async () => {
    mockAuth.mockRejectedValue(new Error('credential details must not be exposed'));
    await expect(
      new VertexLiveProvider(model, { config: { apiKey: 'explicit-key' } }).callApi('Hello'),
    ).rejects.toThrow('Vertex Live requires Google Cloud OAuth credentials');
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it('requires a project ID', async () => {
    mockAuth.mockResolvedValue({ client: { getRequestHeaders }, projectId: undefined });
    await expect(new VertexLiveProvider(model, {}).callApi('Hello')).rejects.toThrow(
      'requires a project ID',
    );
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it.each(['expired', 'missing'])('reports %s OAuth tokens before connecting', async (reason) => {
    if (reason === 'expired') {
      getRequestHeaders.mockRejectedValue(new Error('refresh_token=secret'));
    } else {
      getRequestHeaders.mockResolvedValue(new Headers());
    }
    await expect(new VertexLiveProvider(model, {}).callApi('Hello')).rejects.toThrow(
      'could not obtain an OAuth access token',
    );
    expect(WebSocket).not.toHaveBeenCalled();
  });

  const invalidApiVersion = 'Vertex Live apiVersion must be v1 or v1beta1.';
  it.each([
    [{ config: { apiVersion: 'v1alpha' } }, '', invalidApiVersion],
    [{ config: { apiVersion: 'v1beta' } }, '', invalidApiVersion],
    [
      { config: { region: 'example.com/path' } },
      '',
      'Vertex Live region must be a Google Cloud location ID.',
    ],
    [{ env: { VERTEX_API_VERSION: 'v1alpha' } }, '', invalidApiVersion],
    [{}, 'v1beta', invalidApiVersion],
  ] as const)(
    'rejects invalid endpoint options %j with process version %s before requesting credentials',
    async (options, processVersion, message) => {
      const restoreVersion = mockProcessEnv({ VERTEX_API_VERSION: processVersion });
      try {
        const provider = new VertexLiveProvider(model, options);
        await expect(provider.callApi('Hello')).rejects.toThrow(message);
        expect(mockAuth).not.toHaveBeenCalled();
        expect(WebSocket).not.toHaveBeenCalled();
      } finally {
        restoreVersion();
      }
    },
  );

  it('waits for a fresh Extended Thinking IDLE after a delayed tool response', async () => {
    let finishTool!: (value: object) => void;
    const callback = vi.fn(
      () =>
        new Promise<object>((resolve) => {
          finishTool = resolve;
        }),
    );
    const provider = new VertexLiveProvider(extendedModel, {
      config: {
        tools: [{ function_declarations: [{ name: 'lookup', description: 'Look up a fact' }] }],
        functionToolCallbacks: { lookup: callback },
      },
    });
    const { result } = await start(provider);
    expect(sent()[0].setup).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } },
      tools: [{ functionDeclarations: [{ name: 'lookup', behavior: 'NON_BLOCKING' }] }],
    });
    expect(sent()[0].setup.tools[0]).not.toHaveProperty('function_declarations');
    const tool = emit({
      toolCall: { functionCalls: [{ id: 'call-1', name: 'lookup', args: {} }] },
    });
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    const idle = emit({
      serverContent: {
        outputTranscription: { text: 'Checking. ' },
        turnComplete: true,
        interactionStatus: 'IDLE',
      },
    });
    expect(ws.close).not.toHaveBeenCalled();
    finishTool({ answer: 'ORCHID' });
    await tool;
    await idle;
    const toolResponse = sent().at(-1);
    const closedAfterStaleIdle = vi.mocked(ws.close).mock.calls.length > 0;
    await emit({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: 'AAAAAA==' } }] },
        outputTranscription: { text: 'ORCHID' },
        turnComplete: true,
        interactionStatus: 'IDLE',
      },
    });
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.output).toMatchObject({ text: 'Checking. ORCHID' });
    expect(response.audio?.transcript).toBe('Checking. ORCHID');
    expect(closedAfterStaleIdle).toBe(false);
    expect(toolResponse).toEqual({
      toolResponse: {
        functionResponses: [
          {
            id: 'call-1',
            name: 'lookup',
            response: { answer: 'ORCHID' },
          },
        ],
      },
    });
  });

  it.each(['functionDeclarations', 'function_declarations'])(
    'rejects BLOCKING tools with the %s spelling',
    async (key) => {
      const response = await new VertexLiveProvider(extendedModel, {
        config: {
          tools: [{ [key]: [{ name: 'lookup', behavior: 'BLOCKING' }] }],
        },
      }).callApi('Hello');
      expect(response.error).toContain('requires NON_BLOCKING');
      expect(WebSocket).not.toHaveBeenCalled();
    },
  );

  it('sends the next user turn only after IDLE', async () => {
    const { result } = await start(
      new VertexLiveProvider(extendedModel, {}),
      JSON.stringify([
        { role: 'user', content: 'Remember MARIGOLD.' },
        { role: 'user', content: 'What word did I give you?' },
      ]),
    );
    await emit({
      serverContent: { outputTranscription: { text: 'One moment.' }, turnComplete: true },
    });
    expect(sent()).toHaveLength(2);
    await emit({ interactionStatus: 'IDLE' });
    expect(sent()[2]).toEqual({ realtimeInput: { text: 'What word did I give you?' } });
    await complete();
    expect((await result).error).toBeUndefined();
  });

  it('does not finalize a Vertex tool call on its bookkeeping generationComplete', async () => {
    const callback = vi.fn().mockResolvedValue({ answer: 'ORCHID' });
    const { result } = await start(
      new VertexLiveProvider(model, {
        config: {
          tools: [{ functionDeclarations: [{ name: 'lookup' }] }],
          functionToolCallbacks: { lookup: callback },
        },
      }),
    );
    await emit({ toolCall: { functionCalls: [{ id: 'call-1', name: 'lookup', args: {} }] } });
    await emit({ serverContent: { generationComplete: true } });
    await emit({ serverContent: { turnComplete: true } });
    expect(ws.close).not.toHaveBeenCalled();
    expect(sent().at(-1)).toMatchObject({
      toolResponse: {
        functionResponses: [
          {
            id: 'call-1',
            response: { answer: 'ORCHID' },
          },
        ],
      },
    });
    await emit({ serverContent: { outputTranscription: { text: 'ORCHID' }, turnComplete: true } });
    expect((await result).output).toMatchObject({ text: 'ORCHID' });
  });

  it('marks finite PCM input boundaries and requests transcription', async () => {
    const { result } = await start(
      new VertexLiveProvider(model, {}),
      JSON.stringify([
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } }],
        },
      ]),
    );
    expect(sent()[0].setup.realtimeInputConfig).toEqual({
      automaticActivityDetection: { disabled: true },
    });
    expect(sent().slice(1)).toEqual([
      { realtimeInput: { activityStart: {} } },
      { realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } } },
      { realtimeInput: { activityEnd: {} } },
    ]);
    await complete();
    await result;
  });

  it('sends mixed-input text as context before audio instead of interrupting it', async () => {
    const { result } = await start(
      new VertexLiveProvider(model, {}),
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } },
            { text: 'Identify the city.' },
          ],
        },
      ]),
    );
    expect(sent().slice(1)).toEqual([
      {
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: 'Identify the city.' }] }],
          turnComplete: false,
        },
      },
      { realtimeInput: { activityStart: {} } },
      { realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAAAA==' } } },
      { realtimeInput: { activityEnd: {} } },
    ]);
    await complete();
    await result;
  });

  it('ignores empty and metadata frames until turnComplete', async () => {
    const { result } = await start(new VertexLiveProvider(model, {}));
    await emit({ serverContent: { outputTranscription: { text: 'Hello' } } });
    await emit({});
    await emit({
      usageMetadata: { promptTokenCount: 10, responseTokenCount: 5, totalTokenCount: 15 },
    });
    expect(ws.close).not.toHaveBeenCalled();
    await emit({ serverContent: { turnComplete: true } });
    const response = await result;
    expect(response.tokenUsage).toMatchObject({ prompt: 10, completion: 5, total: 15 });
    expect(response.cost).toBeCloseTo((10 * 0.5) / 1e6 + (5 * 2) / 1e6);
  });

  it.each([403, 404, 429, 500])(
    'surfaces API error %s without successful empty output',
    async (code) => {
      const { result } = await start(new VertexLiveProvider(model, {}));
      await emit({ error: { code, message: 'Request rejected' } });
      expect(await result).toEqual({ error: expect.stringContaining(String(code)) });
    },
  );

  it('does not expose socket authentication headers in connection errors', async () => {
    const log = vi.spyOn(logger, 'error');
    const { result } = await start(new VertexLiveProvider(model, {}));
    ws.onerror?.({
      message: 'Unexpected server response: 403',
      target: { headers: { authorization: 'Bearer secret-token' } },
    } as unknown as WebSocket.ErrorEvent);
    expect(await result).toEqual({ error: expect.stringContaining('403') });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
  });

  it('reports unexpected close and model availability errors', async () => {
    const { result } = await start(new VertexLiveProvider(model, {}));
    ws.onclose?.({ code: 1008, reason: 'Publisher model is not found' } as WebSocket.CloseEvent);
    expect((await result).error).toContain('Publisher model is not found');
  });

  it('times out an idle connection', async () => {
    const { result } = await start(new VertexLiveProvider(model, { config: { timeoutMs: 500 } }));
    await vi.advanceTimersByTimeAsync(501);
    expect((await result).error).toContain('timed out');
    expect(ws.close).toHaveBeenCalled();
  });
});
