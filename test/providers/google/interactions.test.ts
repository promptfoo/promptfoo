import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBlob } from '../../../src/blobs';
import { fetchWithCache } from '../../../src/cache';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { GoogleInteractionsProvider } from '../../../src/providers/google/interactions';
import { fetchWithTimeout } from '../../../src/util/fetch/index';

vi.mock('../../../src/cache', () => ({ fetchWithCache: vi.fn() }));
vi.mock('../../../src/blobs', () => ({ storeBlob: vi.fn() }));
vi.mock('../../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));

describe('GoogleInteractionsProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockStoreBlob = vi.mocked(storeBlob);
  const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so per-test persistent setters like
    // mockFetchWithCache.mockResolvedValue cannot leak across randomized test order.
    vi.resetAllMocks();
    // Keep endpoint resolution hermetic: developers with gcloud configured often have
    // these set, which would silently redirect the Vertex endpoint assertions.
    vi.stubEnv('VERTEX_REGION', '');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    vi.stubEnv('VERTEX_API_HOST', '');
    vi.stubEnv('GOOGLE_API_HOST', '');
    mockStoreBlob.mockResolvedValue({
      ref: { uri: 'blob://video/omni', hash: 'omni', mimeType: 'video/mp4', sizeBytes: 5 },
      deduplicated: false,
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes Omni Flash through the Interactions API and prices video output tokens', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-1',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'b2xk' }],
          },
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/webm', data: 'dmlkZW8=' }],
          },
        ],
        usage: {
          total_input_tokens: 100,
          total_output_tokens: 600,
          total_reasoning_tokens: 20,
          total_tokens: 720,
          output_tokens_by_modality: [
            { modality: 'text', tokens: 100 },
            { modality: 'video', tokens: 500 },
          ],
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '9:16',
        previousInteractionId: 'interaction-0',
        store: true,
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HARASSMENT', probability: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
        systemInstruction: 'This instruction is unsupported by Omni.',
        service_tier: 'priority',
        maxOutputTokens: 2_048,
        generationConfig: {
          maxOutputTokens: 2_048,
          thinking_level: 'low',
          video_config: { task: 'text_to_video' },
          temperature: 0.2,
          topP: 0.8,
          top_p: 0.8,
          stopSequences: ['stop'],
          stop_sequences: ['stop'],
          negative_prompt: 'do not include text',
          system_instruction: 'unsupported',
        } as any,
        passthrough: {
          generation_config: {
            seed: 42,
            temperature: 0.4,
            negative_prompt: 'unsupported passthrough prompt',
          },
          generationConfig: { temperature: 0.6 },
          system_instruction: { parts: [{ text: 'unsupported passthrough instruction' }] },
          temperature: 0.8,
          service_tier: 'priority',
          serviceTier: 'priority',
        },
      },
    });

    const result = await provider.callApi('A city at dusk', { evaluationId: 'eval-1' } as any);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Api-Revision': '2026-05-20',
          'x-goog-api-key': 'test-key',
        }),
        body: JSON.stringify({
          model: 'gemini-omni-flash-preview',
          input: 'A city at dusk',
          response_format: { type: 'video', aspect_ratio: '9:16' },
          previous_interaction_id: 'interaction-0',
          store: true,
          safety_settings: [
            { type: 'hate_speech', threshold: 'block_low_and_above' },
            { type: 'harassment', threshold: 'block_medium_and_above' },
          ],
          generation_config: {
            max_output_tokens: 2_048,
            thinking_level: 'low',
            video_config: { task: 'text_to_video' },
            stop_sequences: ['stop'],
            seed: 42,
          },
          service_tier: 'priority',
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    expect(mockFetchWithCache.mock.calls[0]?.[1]).not.toHaveProperty('_authHash');
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('video'),
      'video/webm',
      expect.objectContaining({ evalId: 'eval-1', kind: 'video' }),
    );
    expect(result.video).toMatchObject({
      id: 'interaction-1',
      url: 'blob://video/omni',
      format: 'webm',
      model: 'gemini-omni-flash-preview',
      aspectRatio: '9:16',
    });
    expect(result.tokenUsage).toEqual({
      prompt: 100,
      completion: 600,
      total: 720,
      cached: 0,
      numRequests: 1,
      completionDetails: { reasoning: 20 },
    });
    expect(result.cost).toBeCloseTo((100 * 1.5 + 120 * 9 + 500 * 17.5) / 1e6, 12);
  });

  it('returns a useful error when the Interactions API does not return video', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [{ type: 'model_output', content: [] }] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('A city at dusk')).resolves.toMatchObject({
      error: 'Gemini interaction did not return video output',
    });
  });

  it('returns text for Robotics ER 2 without requesting video output', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-robotics-1',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: '[{"point":[376,508],"label":"banana"}]' }],
          },
        ],
        usage: {
          total_input_tokens: 1_000,
          total_output_tokens: 500,
          total_tokens: 1_500,
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { tools: [{ type: 'google_search' }] },
      },
    });

    const result = await provider.callApi('Find the banana.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'gemini-robotics-er-2-preview',
      input: 'Find the banana.',
      tools: [{ type: 'google_search' }],
      background: false,
      stream: false,
    });
    expect(result).toMatchObject({
      output: '[{"point":[376,508],"label":"banana"}]',
      tokenUsage: { prompt: 1_000, completion: 500, total: 1_500 },
      cost: 0.007,
      metadata: { interactionId: 'interaction-robotics-1', status: 'completed' },
    });
    expect(result.video).toBeUndefined();
  });

  it('omits sampling controls that the Interactions generation_config schema rejects', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 20,
        },
        passthrough: {
          generation_config: {
            temperature: 0.4,
            top_p: 0.7,
            top_k: 10,
            seed: 42,
          },
          temperature: 0.5,
          top_p: 0.6,
          top_k: 5,
        },
      },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      seed: 42,
    });
    expect(JSON.parse(request.body as string)).not.toMatchObject({
      temperature: expect.anything(),
      top_p: expect.anything(),
      top_k: expect.anything(),
    });
  });

  it('resolves prompt-level system instructions for Robotics ER 2', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        systemInstruction: 'Use the provider instruction.',
      },
    });

    await provider.callApi('Plan the next movement.', {
      vars: { target: 'banana' },
      prompt: {
        config: {
          systemInstruction: 'Move safely toward the {{ target }}.',
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).system_instruction).toBe(
      'Move safely toward the banana.',
    );
  });

  it('keeps passthrough system_instruction precedence for Robotics ER 2', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        systemInstruction: 'Use the configured instruction.',
        passthrough: {
          system_instruction: 'Use the passthrough instruction.',
        },
      },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).system_instruction).toBe(
      'Use the passthrough instruction.',
    );
  });

  it('extracts standard chat system roles into the Robotics system instruction', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        systemInstruction: 'Follow the provider policy.',
      },
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'Never ignore safety constraints.' },
        {
          role: 'system',
          content: [{ type: 'text', text: 'Keep the robot inside the marked area.' }],
        },
        { role: 'user', content: 'Move toward the banana.' },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.system_instruction).toBe(
      'Follow the provider policy.\nNever ignore safety constraints.\nKeep the robot inside the marked area.',
    );
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'Move toward the banana.' }],
      },
    ]);
  });

  it('normalizes camelCase passthrough interaction controls with passthrough precedence', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'robot plan' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        previousInteractionId: 'configured-previous',
        systemInstruction: 'Configured instruction.',
        passthrough: {
          previousInteractionId: 'passthrough-previous',
          responseFormat: [{ type: 'text', mime_type: 'text/plain' }],
          systemInstruction: 'Passthrough instruction.',
        },
      },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.previous_interaction_id).toBe('passthrough-previous');
    expect(body.response_format).toEqual([{ type: 'text', mime_type: 'text/plain' }]);
    expect(body.system_instruction).toBe('Passthrough instruction.');
    expect(body).not.toHaveProperty('previousInteractionId');
    expect(body).not.toHaveProperty('responseFormat');
    expect(body).not.toHaveProperty('systemInstruction');
  });

  it('forwards supported Robotics generation controls and a rendered response schema', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: '{"target":"banana"}' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        topK: 40,
        stopSequences: ['STOP'],
        responseSchema:
          '{"type":"object","properties":{"target":{"type":"string","description":"{{ description }}"}},"required":["target"]}',
      },
    });

    await provider.callApi('Locate the target.', {
      vars: { description: 'Detected object' },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.generation_config).toEqual({
      stop_sequences: ['STOP'],
    });
    expect(body.response_format).toEqual([
      {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Detected object' },
          },
          required: ['target'],
        },
      },
    ]);
  });

  it('translates generationConfig structured-output fields for Robotics ER 2', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: '{"target":"banana"}' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema:
            '{"type":"object","properties":{"target":{"type":"string"}},"required":["target"]}',
        },
        passthrough: {
          generation_config: {
            response_mime_type: 'application/json',
            response_schema:
              '{"type":"object","properties":{"result":{"type":"string","description":"{{ description }}"}},"required":["result"]}',
          },
        },
      },
    });

    await provider.callApi('Locate the target.', {
      vars: { description: 'Detected object' },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.generation_config).toBeUndefined();
    expect(body.response_format).toEqual([
      {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string', description: 'Detected object' },
          },
          required: ['result'],
        },
      },
    ]);
  });

  it('rejects competing top-level and generationConfig schemas for Robotics ER 2', async () => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        responseSchema: '{"type":"object"}',
        generationConfig: {
          response_schema: '{"type":"string"}',
        },
      },
    });

    await expect(provider.callApi('Locate the target.')).rejects.toThrow(
      '`responseSchema` provided but `generationConfig.response_schema` already set.',
    );
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('normalizes only supported camelCase generationConfig fields for Robotics ER 2', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          maxOutputTokens: 512,
          topP: 0.8,
          topK: 20,
          stopSequences: ['DONE'],
          seed: 7,
          thinkingConfig: { thinkingLevel: 'HIGH' },
          thinkingSummaries: 'auto',
          toolChoice: { mode: 'auto' },
          transcriptionConfig: { language_code: 'en-US' },
          videoConfig: { task: 'text_to_video' },
        } as any,
      },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      max_output_tokens: 512,
      stop_sequences: ['DONE'],
      seed: 7,
      thinking_level: 'high',
      thinking_summaries: 'auto',
      tool_choice: { mode: 'auto' },
      transcription_config: { language_code: 'en-US' },
      video_config: { task: 'text_to_video' },
    });
  });

  it('rejects numeric thinkingBudget instead of sending an invalid thinkingConfig object', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          thinkingConfig: { thinkingBudget: 1_024 },
        },
      },
    });

    await expect(provider.callApi('Plan the next movement.')).resolves.toMatchObject({
      error: expect.stringContaining('thinkingBudget'),
    });
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('preserves prompt and passthrough precedence for supported generation fields', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          maxOutputTokens: 1_024,
          stopSequences: ['PROVIDER'],
        },
      },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          generationConfig: {
            maxOutputTokens: 512,
            stopSequences: ['PROMPT'],
            seed: 2,
            thinkingConfig: { thinkingLevel: 'MEDIUM' },
          },
          passthrough: {
            generation_config: {
              seed: 3,
              stop_sequences: ['PASSTHROUGH'],
              thinking_level: 'high',
            },
          },
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      max_output_tokens: 512,
      stop_sequences: ['PASSTHROUGH'],
      seed: 3,
      thinking_level: 'high',
    });
  });

  it('gives prompt top-level controls precedence over provider generationConfig aliases', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          maxOutputTokens: 1_024,
          stopSequences: ['PROVIDER'],
          seed: 1,
        } as any,
      },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          maxOutputTokens: 512,
          stopSequences: ['PROMPT'],
          seed: 2,
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      max_output_tokens: 512,
      stop_sequences: ['PROMPT'],
      seed: 2,
    });
  });

  it.each([
    'flex',
    'standard',
    'priority',
  ] as const)('forwards config service tier %s at the Interactions top level', async (serviceTier) => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key', service_tier: serviceTier },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).service_tier).toBe(serviceTier);
  });

  it.each([
    ['service_tier', 'flex'],
    ['serviceTier', 'priority'],
  ] as const)('gives passthrough %s precedence for service_tier', async (field, serviceTier) => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        service_tier: 'standard',
        passthrough: {
          [field]: serviceTier,
          generation_config: { service_tier: 'flex', serviceTier: 'priority' },
        },
      },
    });

    await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.service_tier).toBe(serviceTier);
    expect(body.serviceTier).toBeUndefined();
    expect(body.generation_config).toBeUndefined();
  });

  it('uses an Omni passthrough model for request formatting, output parsing, and billing', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-omni-override',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
        usage: {
          total_input_tokens: 100,
          total_output_tokens: 600,
          total_tokens: 700,
          output_tokens_by_modality: [
            { modality: 'text', tokens: 100 },
            { modality: 'video', tokens: 500 },
          ],
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '16:9',
        passthrough: { model: 'gemini-omni-flash-preview' },
      },
    });

    const result = await provider.callApi('Create a short robot demonstration.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: 'gemini-omni-flash-preview',
      response_format: { type: 'video', aspect_ratio: '16:9' },
    });
    expect(result.video).toMatchObject({
      id: 'interaction-omni-override',
      model: 'gemini-omni-flash-preview',
    });
    expect(result.cost).toBeCloseTo((100 * 1.5 + 100 * 9 + 500 * 17.5) / 1e6, 12);
  });

  it('uses a Robotics passthrough model for tools, text output, and billing', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-robotics-override',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'robot plan' }],
          },
        ],
        usage: {
          total_input_tokens: 1_000,
          total_output_tokens: 500,
          total_tokens: 1_500,
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: {
          model: 'gemini-robotics-er-2-preview',
          tools: [{ type: 'google_search' }],
        },
      },
    });

    const result = await provider.callApi('Plan the next movement.');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      model: 'gemini-robotics-er-2-preview',
      tools: [{ type: 'google_search' }],
    });
    expect(body).not.toHaveProperty('response_format');
    expect(result).toMatchObject({
      output: 'robot plan',
      cost: 0.007,
      metadata: { interactionId: 'interaction-robotics-override', status: 'completed' },
    });
    expect(result.video).toBeUndefined();
  });

  it('rejects generateContent-style Robotics tools instead of silently dropping them', async () => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key', tools: [{ googleSearch: {} }] },
    });

    await expect(provider.callApi('Find the banana.')).resolves.toMatchObject({
      error: expect.stringContaining('passthrough.tools'),
    });
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    [
      'custom function',
      {
        type: 'function',
        name: 'move_robot_arm',
        description: 'Moves the robot arm to a target point.',
        parameters: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
        },
      },
    ],
    ['computer-use', { type: 'computer_use', environment: 'browser' }],
  ])('rejects client-executed Robotics %s tools', async (_toolKind, tool) => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { tools: [tool] },
      },
    });

    await expect(provider.callApi('Move the arm to the banana.')).resolves.toMatchObject({
      error: expect.stringContaining('requires_action'),
    });
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('normalizes Promptfoo chat roles for the Omni Interactions API', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/chat' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'Keep the scene family friendly.' },
        { role: 'developer', content: 'Use a cinematic style.' },
        { role: 'user', content: 'Create a city at dusk.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Use this reference.' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,aW1hZ2U=' } },
            { type: 'input_image', image_url: 'https://image.example/reference.png' },
            { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'mp3' } },
          ],
        },
        { role: 'assistant', content: 'I will create that scene.' },
        { role: 'user', content: 'Add rain.' },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'Keep the scene family friendly.' }],
      },
      { type: 'user_input', content: [{ type: 'text', text: 'Use a cinematic style.' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'Create a city at dusk.' }] },
      {
        type: 'user_input',
        content: [
          { type: 'text', text: 'Use this reference.' },
          { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' },
          { type: 'image', uri: 'https://image.example/reference.png' },
          { type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' },
        ],
      },
      { type: 'model_output', content: [{ type: 'text', text: 'I will create that scene.' }] },
      { type: 'user_input', content: [{ type: 'text', text: 'Add rain.' }] },
    ]);
  });

  it('normalizes native Gemini chat parts for the Omni Interactions API', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          parts: [
            { text: 'Create a city at dusk using these references.' },
            { inlineData: { mimeType: 'image/jpeg', data: 'aW1hZ2U=' } },
            { fileData: { mimeType: 'video/mp4', fileUri: 'https://video.example/reference' } },
            { inline_data: { mime_type: 'image/png', data: 'cG5n' } },
            { file_data: { mime_type: 'video/webm', file_uri: 'https://video.example/snake' } },
          ],
        },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      {
        type: 'user_input',
        content: [
          { type: 'text', text: 'Create a city at dusk using these references.' },
          { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' },
          { type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/reference' },
          { type: 'image', mime_type: 'image/png', data: 'cG5n' },
          { type: 'video', mime_type: 'video/webm', uri: 'https://video.example/snake' },
        ],
      },
    ]);
  });

  it('unwraps native Gemini prompt envelopes for the Omni Interactions API', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify({
        system_instruction: { parts: [{ text: 'unsupported Omni instruction' }] },
        contents: [{ role: 'user', parts: [{ text: 'Create a city at dusk.' }] }],
      }),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      { type: 'user_input', content: [{ type: 'text', text: 'Create a city at dusk.' }] },
    ]);
  });

  it('prices reported Interactions input and output modalities with configured overrides', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
        usage: {
          total_input_tokens: 1_000,
          total_tool_use_tokens: 100,
          total_cached_tokens: 200,
          total_output_tokens: 500,
          total_reasoning_tokens: 20,
          total_tokens: 1_620,
          input_tokens_by_modality: [
            { modality: 'text', tokens: 400 },
            { modality: 'audio', tokens: 300 },
            { modality: 'image', tokens: 300 },
          ],
          tool_use_tokens_by_modality: [{ modality: 'audio', tokens: 100 }],
          cached_tokens_by_modality: [
            { modality: 'audio', tokens: 100 },
            { modality: 'image', tokens: 100 },
          ],
          output_tokens_by_modality: [
            { modality: 'text', tokens: 100 },
            { modality: 'audio', tokens: 100 },
            { modality: 'video', tokens: 300 },
          ],
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        inputCost: 0.01,
        outputCost: 0.04,
        audioInputCost: 0.02,
        audioOutputCost: 0.05,
        imageInputCost: 0.03,
        videoOutputCost: 0.06,
      },
    });

    const result = await provider.callApi('Animate the reference');

    expect(result.tokenUsage).toMatchObject({
      prompt: 1_100,
      completion: 500,
      total: 1_620,
      cached: 200,
      completionDetails: { reasoning: 20 },
    });
    expect(result.cost).toBeCloseTo(48.8, 10);
  });

  it('returns only the latest Omni turn and stores authenticated URI-delivered video', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-latest',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'old response' },
              { type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/old' },
            ],
          },
          { type: 'user_input', content: [{ type: 'text', text: 'make it rainy' }] },
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'new response' },
              {
                type: 'video',
                mime_type: 'video/webm',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout.mockResolvedValue(new Response(Buffer.from('latest video')) as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', previousInteractionId: 'interaction-old' },
    });

    const result = await provider.callApi('make it rainy');

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?alt=media',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
      }),
      expect.any(Number),
    );
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('latest video'),
      'video/webm',
      expect.objectContaining({ kind: 'video' }),
    );
    expect(result.output).toBe('new response');
    expect(result.video).toMatchObject({ url: 'blob://video/omni', format: 'webm' });
  });

  it('does not forward Gemini credentials across a video-download redirect', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'video',
                mime_type: 'video/mp4',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-2:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://storage.googleapis.com/signed-video' },
        }) as any,
      )
      .mockResolvedValueOnce(new Response(Buffer.from('redirected video')) as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('a city at dusk');

    expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://generativelanguage.googleapis.com/v1beta/files/video-2:download?alt=media',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        redirect: 'manual',
      }),
      expect.any(Number),
    );
    expect(mockFetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://storage.googleapis.com/signed-video',
      { method: 'GET', redirect: 'manual' },
      expect.any(Number),
    );
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('redirected video'),
      'video/mp4',
      expect.any(Object),
    );
  });

  it('refuses an untrusted video-download redirect before making a second request', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'video',
                mime_type: 'video/mp4',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-3:download?alt=media',
              },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }) as any,
    );
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('a city at dusk');

    expect(result.error).toBe(
      'Refusing untrusted Gemini interaction video redirect: http://169.254.169.254',
    );
    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockStoreBlob).not.toHaveBeenCalled();
  });

  it('does not reuse an Omni video from a previous interaction turn', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/old' }],
          },
          { type: 'user_input', content: [{ type: 'text', text: 'make it rainy' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'no video generated' }] },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini interaction did not return video output',
    });
  });

  it('polls an in-progress Omni interaction until video output is ready', async () => {
    mockFetchWithCache
      .mockResolvedValueOnce({
        data: { id: 'interaction-pending', status: 'in_progress' },
        cached: false,
      } as any)
      .mockResolvedValueOnce({
        data: {
          id: 'interaction-pending',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
            },
          ],
        },
        cached: false,
      } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', timeoutMs: 1_000 },
    });

    const result = await provider.callApi('make it rainy');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
    expect(mockFetchWithCache).toHaveBeenNthCalledWith(
      2,
      'https://generativelanguage.googleapis.com/v1beta/interactions/interaction-pending',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Api-Revision': '2026-05-20',
          'x-goog-api-key': 'test-key',
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('surfaces a failed latest Omni model-output step instead of reusing old video', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'b2xk' }],
          },
          { type: 'user_input', content: [{ type: 'text', text: 'make it rainy' }] },
          { type: 'model_output', error: { message: 'video generation failed' } },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('make it rainy');

    expect(result.error).toBe('Gemini Interactions API error: video generation failed');
    expect(mockStoreBlob).not.toHaveBeenCalled();
  });

  it('returns only the trailing text accompanying the latest Omni video output', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'text', text: 'intermediate narration' },
              { type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' },
              { type: 'text', text: 'final caption' },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('make it rainy');

    expect(result.output).toBe('final caption');
  });

  it('forwards native multimodal input and prompt-level interaction overrides', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-2',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/2' }],
          },
        ],
        usage: { total_input_tokens: 10, total_output_tokens: 20, total_tokens: 30 },
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'base-key', apiBaseUrl: 'https://proxy.example/google' },
    });
    const input = [
      { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' },
      { type: 'text', text: 'Animate this image' },
    ];

    const result = await provider.callApi(JSON.stringify(input), {
      bustCache: true,
      prompt: { config: { aspectRatio: '16:9', previousInteractionId: 'interaction-1' } },
    } as any);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://proxy.example/google/v1beta/interactions',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'gemini-omni-flash-preview',
          input,
          response_format: { type: 'video', aspect_ratio: '16:9' },
          previous_interaction_id: 'interaction-1',
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    expect(mockStoreBlob).not.toHaveBeenCalled();
    expect(result.video?.url).toBe('https://video.example/2');
    expect(result.cost).toBeUndefined();
  });

  it('preserves a single native multimodal interaction input object', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/1' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });
    const input = { type: 'image', mime_type: 'image/jpeg', data: 'aW1hZ2U=' };

    await provider.callApi(JSON.stringify(input));

    const body = JSON.parse(mockFetchWithCache.mock.calls[0]?.[1]?.body as string);
    expect(body.input).toEqual(input);
  });

  it('requires a Gemini API key', async () => {
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {},
      env: { GOOGLE_API_KEY: undefined, GEMINI_API_KEY: undefined },
    });

    await expect(provider.callApi('A city at dusk')).resolves.toMatchObject({
      error: expect.stringContaining('Gemini Interactions API requires an API key'),
    });
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('routes Vertex Omni through the global Interactions endpoint with OAuth authentication', async () => {
    const oauthHeaders = new Headers();
    oauthHeaders.set('Authorization', 'Bearer vertex-token');
    oauthHeaders.set('x-goog-user-project', 'quota-project');
    const getRequestHeaders = vi.fn().mockResolvedValue(oauthHeaders);
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
        getRequestHeaders,
      },
      projectId: 'detected-project',
    });
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      id: 'vertex:gemini-omni-flash-preview',
      config: {
        vertexai: true,
        projectId: 'configured-project',
        aspectRatio: '16:9',
        temperature: 0.2,
        topP: 0.9,
      },
    });

    const result = await provider.callApi('A city at dusk');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/global/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Api-Revision': '2026-05-20',
          Authorization: 'Bearer vertex-token',
          'x-goog-user-project': 'quota-project',
        }),
        body: JSON.stringify({
          model: 'gemini-omni-flash-preview',
          input: [{ type: 'text', text: 'A city at dusk' }],
          response_format: [{ type: 'video', aspect_ratio: '16:9' }],
          background: false,
          stream: false,
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    expect(getRequestHeaders).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/global/interactions',
    );
  });

  it('rejects unsupported Vertex Omni follow-up interactions before making a request', async () => {
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        vertexai: true,
        projectId: 'configured-project',
        previousInteractionId: 'interaction-0',
      },
    });

    const result = await provider.callApi('Make it brighter');

    expect(result.error).toContain('does not support previousInteractionId');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects unsupported Vertex Omni follow-ups supplied through passthrough', async () => {
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        vertexai: true,
        projectId: 'configured-project',
        passthrough: { previous_interaction_id: 'interaction-0' },
      },
    });

    const result = await provider.callApi('Make it brighter');

    expect(result.error).toContain('does not support previousInteractionId');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects Vertex Omni follow-ups supplied through a camelCase passthrough key', async () => {
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        vertexai: true,
        projectId: 'configured-project',
        passthrough: { previousInteractionId: 'interaction-0' },
      },
    });

    const result = await provider.callApi('Make it brighter');

    expect(result.error).toContain('does not support previousInteractionId');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('does not reject an AI Studio Omni follow-up supplied through passthrough', async () => {
    // The follow-up guard is Vertex-only; AI Studio supports conversational editing, so
    // the request must proceed past the guard (here it reaches the API-key check).
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        passthrough: { previous_interaction_id: 'interaction-0' },
      },
      env: { GOOGLE_API_KEY: undefined, GEMINI_API_KEY: undefined },
    });

    const result = await provider.callApi('Make it brighter');

    expect(result.error).not.toContain('does not support previousInteractionId');
    expect(result.error).toContain('requires an API key');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects unsupported Omni tools before making a request', async () => {
    const unsupportedToolConfigs = [
      { tools: [{ googleSearch: {} }] },
      { passthrough: { tools: [{ type: 'google_search' }] } },
      { mcp: { enabled: true } },
    ];
    for (const toolConfig of unsupportedToolConfigs) {
      const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
        config: { apiKey: 'test-key', ...toolConfig } as any,
      });

      const result = await provider.callApi('A city at dusk');

      expect(result.error).toContain('does not support tools');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    }
  });

  it.each([
    { tools: [] },
    { passthrough: { tools: [] } },
  ])('allows an empty Omni tools list: %j', async (toolConfig) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', data: 'dmlkZW8=' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', ...toolConfig },
    });

    const result = await provider.callApi('A city at dusk');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledOnce();
  });

  it('downloads Vertex Omni gs:// video output using OAuth headers', async () => {
    const video = { type: 'video', mime_type: 'video/mp4', uri: 'gs://video-bucket/out/a.mp4' };
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
        getRequestHeaders: vi.fn().mockResolvedValue(
          new Headers({
            Authorization: 'Bearer vertex-token',
            'x-goog-user-project': 'quota-project',
          }),
        ),
      },
      projectId: 'configured-project',
    });
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [video],
          },
        ],
      },
      cached: false,
    } as any);
    mockFetchWithTimeout.mockResolvedValue(new Response(Buffer.from('vertex video')) as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { vertexai: true, projectId: 'configured-project' },
    });

    const result = await provider.callApi('A city at dusk');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://storage.googleapis.com/download/storage/v1/b/video-bucket/o/out%2Fa.mp4?alt=media',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer vertex-token',
          'x-goog-user-project': 'quota-project',
        },
        redirect: 'manual',
      }),
      expect.any(Number),
    );
    expect(mockStoreBlob).toHaveBeenCalledWith(
      Buffer.from('vertex video'),
      'video/mp4',
      expect.any(Object),
    );
  });

  it('preserves a configured provider id and supports the legacy PALM API key', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/palm' }],
          },
        ],
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      id: 'omni-vertical',
      env: { PALM_API_KEY: 'legacy-palm-key' },
    });

    await provider.callApi('A city at dusk');

    expect(provider.id()).toBe('omni-vertical');
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'legacy-palm-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('renders a configured Gemini API-key template before authentication', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'rendered-google-key');
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/5' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: '{{ env.GOOGLE_API_KEY }}' },
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'rendered-google-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    vi.unstubAllEnvs();
  });

  it.each([
    [{ GOOGLE_API_HOST: 'proxy-host.example' }, 'https://proxy-host.example/v1beta/interactions'],
    [
      { GOOGLE_API_BASE_URL: 'https://proxy.example/google' },
      'https://proxy.example/google/v1beta/interactions',
    ],
  ])('honors documented Google endpoint environment overrides', async (env, endpoint) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/3' }],
          },
        ],
      },
      cached: true,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
      env: env as any,
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it.each([
    [
      { apiHost: 'http://127.0.0.1:15500/proxy' },
      { GOOGLE_API_HOST: 'wrong.example' },
      'http://127.0.0.1:15500/proxy/v1beta/interactions',
    ],
    [
      { apiBaseUrl: 'http://127.0.0.1:15500/proxy' },
      { GOOGLE_API_HOST: 'wrong.example' },
      'http://127.0.0.1:15500/proxy/v1beta/interactions',
    ],
  ])('prefers explicit interaction endpoints and preserves HTTP schemes', async (config, env, endpoint) => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'video', mime_type: 'video/mp4', uri: 'https://video.example/4' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { ...config, apiKey: 'test-key' },
      env,
    });

    await provider.callApi('A city at dusk');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.any(Object),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('returns a timeout error when polling exceeds the configured deadline', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { id: 'interaction-slow', status: 'in_progress' },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', timeoutMs: 0 },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini interaction timed out after 0ms (status: in_progress)',
    });
  });

  it('surfaces a terminal non-completed interaction status', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { id: 'interaction-dead', status: 'failed' },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini interaction did not complete (status: failed)',
    });
  });

  it('surfaces gateway errors without a Google-shaped error body', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { message: 'Service Unavailable' },
      cached: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini Interactions API error: HTTP 503 Service Unavailable',
    });
  });

  it('surfaces polling gateway errors without a Google-shaped error body', async () => {
    mockFetchWithCache
      .mockResolvedValueOnce({
        data: { id: 'interaction-pending', status: 'in_progress' },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any)
      .mockResolvedValueOnce({
        data: {},
        cached: false,
        status: 502,
        statusText: 'Bad Gateway',
      } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', timeoutMs: 1_000 },
    });

    await expect(provider.callApi('make it rainy')).resolves.toMatchObject({
      error: 'Gemini Interactions API polling error: HTTP 502 Bad Gateway',
    });
  });

  it('keeps the raw URI without downloading when the video origin is untrusted', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              { type: 'video', mime_type: 'video/mp4', uri: 'https://evil.example/video.mp4' },
            ],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('A city at dusk');

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('https://evil.example/video.mp4');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    expect(mockStoreBlob).not.toHaveBeenCalled();
  });
});
