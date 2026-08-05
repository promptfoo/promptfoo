import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBlob } from '../../../src/blobs';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
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
  const disabledToolPolicies = [
    { name: 'tool_choice', config: { tool_choice: 'none' as const } },
    {
      name: 'toolConfig',
      config: { toolConfig: { functionCallingConfig: { mode: 'NONE' as const } } },
    },
    {
      name: 'tool_config',
      config: { tool_config: { function_calling_config: { mode: 'none' as const } } },
    },
  ];
  const inheritedToolSources = [
    { name: 'config.tools', config: { tools: [{ googleSearch: {} }] } },
    { name: 'MCP', config: { mcp: { enabled: true } } },
  ];
  const interactionModels = [
    {
      name: 'Robotics',
      id: 'gemini-robotics-er-2-preview',
      responseContent: { type: 'text', text: 'no tools' },
    },
    {
      name: 'Omni',
      id: 'gemini-omni-flash-preview',
      responseContent: { type: 'video', data: 'dmlkZW8=' },
    },
  ];
  const disabledInheritedToolCases = interactionModels.flatMap((model) =>
    inheritedToolSources.flatMap((source) =>
      disabledToolPolicies.map((policy) => ({ model, source, policy })),
    ),
  );

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

  it('applies layered response_format precedence for Omni video requests', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const providerDefault = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '9:16',
        passthrough: {
          response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p' },
        },
      },
    });
    const promptConfig = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '9:16',
        passthrough: {
          response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p' },
        },
      },
    });
    const promptPassthrough = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        aspectRatio: '9:16',
        passthrough: {
          response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p' },
        },
      },
    });

    await providerDefault.callApi('A city at dusk');
    await promptConfig.callApi('A city at dusk', {
      prompt: { config: { aspectRatio: '16:9' } },
    } as any);
    await promptPassthrough.callApi('A city at dusk', {
      prompt: {
        config: {
          aspectRatio: '16:9',
          passthrough: {
            response_format: { type: 'video', aspect_ratio: '9:16', resolution: '1080p' },
          },
        },
      },
    } as any);

    const responseFormats = mockFetchWithCache.mock.calls.map(
      ([, request]) => JSON.parse((request as RequestInit).body as string).response_format,
    );
    expect.soft(responseFormats[0]).toEqual({
      type: 'video',
      aspect_ratio: '16:9',
      resolution: '720p',
    });
    expect.soft(responseFormats[1]).toEqual({ type: 'video', aspect_ratio: '16:9' });
    expect.soft(responseFormats[2]).toEqual({
      type: 'video',
      aspect_ratio: '9:16',
      resolution: '1080p',
    });
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

  it.each([
    ['provider tool_choice', { tool_choice: 'none' as const }, undefined],
    [
      'provider toolConfig',
      { toolConfig: { functionCallingConfig: { mode: 'NONE' as const } } },
      undefined,
    ],
    [
      'provider tool_config',
      { tool_config: { function_calling_config: { mode: 'none' as const } } },
      undefined,
    ],
    ['prompt tool_choice', {}, { tool_choice: 'none' as const }],
    ['prompt toolConfig', {}, { toolConfig: { functionCallingConfig: { mode: 'NONE' as const } } }],
    [
      'prompt tool_config',
      {},
      { tool_config: { function_calling_config: { mode: 'none' as const } } },
    ],
  ])(
    'disables inherited Interactions managed tools for %s',
    async (_, providerPolicy, promptPolicy) => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          id: 'interaction-tools-disabled',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'no tools' }] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          passthrough: { tools: [{ type: 'google_search' }] },
          ...providerPolicy,
        },
      });

      await provider.callApi(
        'Do not search.',
        promptPolicy ? ({ prompt: { config: promptPolicy } } as any) : undefined,
      );

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(request.body as string);
      expect(body).not.toHaveProperty('tools');
      expect(body.generation_config).toMatchObject({ tool_choice: 'none' });
    },
  );

  it('lets a prompt-level auto policy re-enable inherited Interactions tools', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-tools-reenabled',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'searched' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        tool_choice: 'none',
        passthrough: { tools: [{ type: 'google_search' }] },
      },
    });

    await provider.callApi('Search if needed.', {
      prompt: { config: { tool_choice: 'auto' } },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.tools).toEqual([{ type: 'google_search' }]);
    expect(body.generation_config?.tool_choice).not.toBe('none');
  });

  it('removes disabled inherited tools before Omni unsupported-tool validation', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-omni-tools-disabled',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'video', data: 'dmlkZW8=' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: {
        apiKey: 'test-key',
        tool_choice: 'none',
        passthrough: { tools: [{ type: 'google_search' }] },
      },
    });

    const result = await provider.callApi('Create a video without tools.');

    expect(result.error).toBeUndefined();
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body).not.toHaveProperty('tools');
    expect(body.generation_config?.tool_choice).toBeUndefined();
  });

  it.each(disabledInheritedToolCases)(
    'ignores inherited $source.name for $model.name when prompt uses $policy.name',
    async ({ model, source, policy }) => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          id: 'interaction-inherited-tools-disabled',
          status: 'completed',
          steps: [{ type: 'model_output', content: [model.responseContent] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider(model.id, {
        config: {
          apiKey: 'test-key',
          ...source.config,
        } as any,
      });

      const result = await provider.callApi('Do not use tools.', {
        prompt: { config: policy.config },
      } as any);

      expect(result.error).toBeUndefined();
      expect(mockFetchWithCache).toHaveBeenCalledOnce();
      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(request.body as string);
      expect(body).not.toHaveProperty('tools');
      if (model.name === 'Robotics') {
        expect(body.generation_config).toMatchObject({ tool_choice: 'none' });
      } else {
        expect(body.generation_config?.tool_choice).toBeUndefined();
      }
    },
  );

  it('preserves Interactions grounding annotations and Google Search steps', async () => {
    const googleSearchCall = {
      type: 'google_search_call',
      id: 'search-1',
      arguments: { queries: ['Euro 2024 winner'] },
    };
    const googleSearchResult = {
      type: 'google_search_result',
      call_id: 'search-1',
      result: [{ search_suggestions: '<div>Search suggestions</div>' }],
    };
    const annotations = [
      {
        type: 'url_citation',
        url: 'https://example.com/euro-2024',
        title: 'Example Sports',
        start_index: 2,
        end_index: 9,
      },
    ];
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-grounded-1',
        status: 'completed',
        steps: [
          googleSearchCall,
          googleSearchResult,
          {
            type: 'model_output',
            content: [{ type: 'text', text: '¡España ganó.', annotations }],
          },
        ],
        usage: { total_input_tokens: 10, total_output_tokens: 3, total_tokens: 13 },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { tools: [{ type: 'google_search' }] },
      },
    });

    await expect(provider.callApi('Who won Euro 2024?')).resolves.toMatchObject({
      output: '¡España ganó.',
      metadata: {
        annotations,
        citations: [
          {
            url: 'https://example.com/euro-2024',
            content: 'Example Sports: España',
          },
        ],
        interactionToolCalls: [googleSearchCall],
        interactionToolResults: [googleSearchResult],
      },
    });
  });

  it('normalizes File Search and Google Maps grounding citations', async () => {
    const annotations = [
      {
        type: 'file_citation',
        document_uri: 'gs://example-bucket/guide.pdf',
        file_name: 'Guide',
        page_number: 7,
        start_index: 0,
        end_index: 5,
      },
      {
        type: 'place_citation',
        place_id: 'places/example-bistro',
        name: 'Example Bistro',
        url: 'https://maps.google.com/?cid=123',
        start_index: 10,
        end_index: 16,
      },
    ];
    mockFetchWithCache.mockResolvedValue({
      data: {
        id: 'interaction-mixed-grounding',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'Guide and Bistro.', annotations }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    await expect(provider.callApi('Find the cited guide and restaurant.')).resolves.toMatchObject({
      metadata: {
        annotations,
        citations: [
          {
            source: 'gs://example-bucket/guide.pdf',
            content: 'Guide (page 7): Guide',
          },
          {
            url: 'https://maps.google.com/?cid=123',
            content: 'Example Bistro: Bistro',
          },
        ],
      },
    });
  });

  it('normalizes standard multimodal input_text parts for Robotics ER 2', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Locate the object in this image.' },
            { type: 'input_image', image_url: 'data:image/png;base64,aW1hZ2U=' },
          ],
        },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      {
        type: 'user_input',
        content: [
          { type: 'text', text: 'Locate the object in this image.' },
          { type: 'image', mime_type: 'image/png', data: 'aW1hZ2U=' },
        ],
      },
    ]);
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

  it('resolves systemInstruction files from the provider basePath and preserves absolute refs', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-interactions-instruction-'));
    const providerBasePath = path.join(root, 'provider');
    const cliBasePath = path.join(root, 'cli');
    const absoluteInstructionPath = path.join(root, 'absolute-instruction.txt');
    fs.mkdirSync(providerBasePath);
    fs.mkdirSync(cliBasePath);
    fs.writeFileSync(path.join(providerBasePath, 'instruction.txt'), 'Provider instruction.');
    fs.writeFileSync(path.join(cliBasePath, 'instruction.txt'), 'CLI instruction.');
    fs.writeFileSync(absoluteInstructionPath, 'Absolute instruction.');
    const originalCliBasePath = cliState.basePath;
    cliState.basePath = cliBasePath;

    try {
      const relativeProvider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          systemInstruction: 'file://instruction.txt',
        },
      });
      const absoluteProvider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          systemInstruction: `file://${absoluteInstructionPath}`,
        },
      });

      await relativeProvider.callApi('Plan the next movement.');
      await absoluteProvider.callApi('Plan the next movement.');

      const bodies = mockFetchWithCache.mock.calls.map(([, request]) =>
        JSON.parse((request as RequestInit).body as string),
      );
      expect(bodies[0].system_instruction).toBe('Provider instruction.');
      expect(bodies[1].system_instruction).toBe('Absolute instruction.');
    } finally {
      cliState.basePath = originalCliBasePath;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves prompt-owned systemInstruction files from the prompt basePath', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'promptfoo-interactions-prompt-instruction-'),
    );
    const providerBasePath = path.join(root, 'provider');
    const promptBasePath = path.join(root, 'prompt');
    fs.mkdirSync(providerBasePath);
    fs.mkdirSync(promptBasePath);
    fs.writeFileSync(path.join(providerBasePath, 'instruction.txt'), 'Provider instruction.');
    fs.writeFileSync(path.join(promptBasePath, 'instruction.txt'), 'Prompt instruction.');

    try {
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          systemInstruction: 'file://instruction.txt',
        },
      });

      await provider.callApi('Plan the next movement.', {
        prompt: {
          config: {
            basePath: promptBasePath,
            systemInstruction: 'file://instruction.txt',
          },
        },
      } as any);

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(request.body as string).system_instruction).toBe('Prompt instruction.');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it('preserves camelCase systemInstruction from a Gemini prompt envelope', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'robot plan' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi(
      JSON.stringify({
        systemInstruction: { parts: [{ text: 'Keep the robot inside the marked area.' }] },
        contents: [{ role: 'user', parts: [{ text: 'Move toward the banana.' }] }],
      }),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.system_instruction).toBe('Keep the robot inside the marked area.');
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'Move toward the banana.' }],
      },
    ]);
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

  it('converts a system-only Robotics prompt into user input', async () => {
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
        passthrough: { system_instruction: 'Provider default instruction.' },
      },
    });

    await provider.callApi(
      JSON.stringify([{ role: 'system', content: 'Move only inside the marked area.' }]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'Move only inside the marked area.' }],
      },
    ]);
    expect(body).not.toHaveProperty('system_instruction');
  });

  it.each([
    ['an empty array', []],
    ['an item with empty parts', [{ role: 'user', parts: [] }]],
    ['an item with whitespace-only content', [{ role: 'user', content: '   ' }]],
    ['an empty object item', [{}]],
  ])('rejects an interaction prompt with %s', async (_description, input) => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi(JSON.stringify(input));

    expect(result.error).toContain('at least one input item');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty array', []],
    ['blank text', '   '],
    ['an empty object', {}],
    ['an item with empty content', [{ type: 'user_input', content: [] }]],
  ])('rejects %s from provider passthrough before dispatch', async (_description, input) => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { input },
      },
    });

    const result = await provider.callApi('Prompt-derived input.');

    expect(result.error).toContain('at least one input item');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('lets prompt-embedded system roles override a provider passthrough default', async () => {
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
        passthrough: { system_instruction: 'Provider default instruction.' },
      },
    });

    await provider.callApi(
      JSON.stringify([
        { role: 'system', content: 'Prompt system instruction.' },
        { role: 'user', content: 'Move toward the banana.' },
      ]),
    );

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).system_instruction).toBe(
      'Prompt system instruction.',
    );
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

  it('lets prompt interaction controls override provider passthrough defaults', async () => {
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
        passthrough: {
          previous_interaction_id: 'provider-previous',
          system_instruction: 'Provider instruction.',
        },
      },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          previousInteractionId: 'prompt-previous',
          systemInstruction: 'Prompt instruction.',
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.previous_interaction_id).toBe('prompt-previous');
    expect(body.system_instruction).toBe('Prompt instruction.');
  });

  it('preserves layered passthrough input precedence', async () => {
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
        passthrough: {
          input: 'Provider passthrough input.',
          store: false,
          safety_settings: [{ type: 'dangerous_content', threshold: 'block_none' }],
        },
      },
    });

    await provider.callApi('[]', {
      prompt: {
        config: {
          store: true,
          safetySettings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          ],
        },
      },
    } as any);

    await provider.callApi('[]', {
      prompt: {
        config: {
          passthrough: { input: 'Prompt passthrough input.' },
        },
      },
    } as any);

    const bodies = mockFetchWithCache.mock.calls.map(([, request]) =>
      JSON.parse((request as RequestInit).body as string),
    );
    expect(bodies[0]).toMatchObject({
      input: 'Provider passthrough input.',
      store: true,
      safety_settings: [{ type: 'hate_speech', threshold: 'block_low_and_above' }],
    });
    expect(bodies[1].input).toBe('Prompt passthrough input.');
  });

  it('accepts an empty prompt when passthrough provides semantic input', async () => {
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
        passthrough: { input: [{ type: 'text', text: 'Provider passthrough input.' }] },
      },
    });

    const response = await provider.callApi('');

    expect(response.error).toBeUndefined();
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).input).toEqual([
      { type: 'text', text: 'Provider passthrough input.' },
    ]);
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

  it('resolves responseSchema files from the provider basePath before the CLI base path', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-interactions-schema-'));
    const providerBasePath = path.join(root, 'provider');
    const cliBasePath = path.join(root, 'cli');
    fs.mkdirSync(providerBasePath);
    fs.mkdirSync(cliBasePath);
    fs.writeFileSync(
      path.join(providerBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { provider: { type: 'string' } } }),
    );
    fs.writeFileSync(
      path.join(cliBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { cli: { type: 'string' } } }),
    );
    const originalCliBasePath = cliState.basePath;
    cliState.basePath = cliBasePath;

    try {
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          responseSchema: 'file://response-schema.json',
        },
      });

      await provider.callApi('Locate the target.');

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(request.body as string).response_format).toEqual([
        {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: { provider: { type: 'string' } },
          },
        },
      ]);
    } finally {
      cliState.basePath = originalCliBasePath;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves prompt-owned responseSchema files from the prompt basePath', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-interactions-prompt-schema-'));
    const providerBasePath = path.join(root, 'provider');
    const promptBasePath = path.join(root, 'prompt');
    fs.mkdirSync(providerBasePath);
    fs.mkdirSync(promptBasePath);
    fs.writeFileSync(
      path.join(providerBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { provider: { type: 'string' } } }),
    );
    fs.writeFileSync(
      path.join(promptBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { prompt: { type: 'string' } } }),
    );

    try {
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          responseSchema: 'file://response-schema.json',
        },
      });

      await provider.callApi('Locate the target.', {
        prompt: {
          config: {
            basePath: promptBasePath,
            responseSchema: 'file://response-schema.json',
          },
        },
      } as any);

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(request.body as string).response_format).toEqual([
        {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: { prompt: { type: 'string' } },
          },
        },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  for (const [alias, mimeTypeField] of [
    ['camelCase', 'responseMimeType'],
    ['snake_case', 'response_mime_type'],
  ]) {
    it(`merges a provider-owned schema with a prompt MIME type using the ${alias} alias`, async () => {
      mockFetchWithCache.mockResolvedValue({
        data: { status: 'completed', steps: [] },
        cached: false,
      } as any);
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-interactions-layered-schema-'));
      const providerBasePath = path.join(root, 'provider');
      const promptBasePath = path.join(root, 'prompt');
      fs.mkdirSync(providerBasePath);
      fs.mkdirSync(promptBasePath);
      fs.writeFileSync(
        path.join(providerBasePath, 'response-schema.json'),
        JSON.stringify({ type: 'object', properties: { provider: { type: 'string' } } }),
      );
      fs.writeFileSync(
        path.join(promptBasePath, 'response-schema.json'),
        JSON.stringify({ type: 'object', properties: { prompt: { type: 'string' } } }),
      );

      try {
        const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
          config: {
            apiKey: 'test-key',
            basePath: providerBasePath,
            responseSchema: 'file://response-schema.json',
            generationConfig: {
              response_mime_type: 'text/plain',
            },
          },
        });

        await provider.callApi('Locate the target.', {
          prompt: {
            config: {
              basePath: promptBasePath,
              generationConfig: {
                [mimeTypeField]: 'application/json',
              },
            },
          },
        } as any);

        const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(request.body as string).response_format).toEqual([
          {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: { provider: { type: 'string' } },
            },
          },
        ]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('drops an inherited schema when a prompt requests plain text output', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        responseSchema: '{"type":"object","properties":{"provider":{"type":"string"}}}',
      },
    });

    await provider.callApi('Locate the target.', {
      prompt: {
        config: {
          generationConfig: { responseMimeType: 'text/plain' },
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).response_format).toEqual([
      {
        type: 'text',
        mime_type: 'text/plain',
      },
    ]);
  });

  it('defaults a prompt-owned schema to JSON instead of inheriting the provider MIME type', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-interactions-layered-mime-'));
    const providerBasePath = path.join(root, 'provider');
    const promptBasePath = path.join(root, 'prompt');
    fs.mkdirSync(providerBasePath);
    fs.mkdirSync(promptBasePath);
    fs.writeFileSync(
      path.join(providerBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { provider: { type: 'string' } } }),
    );
    fs.writeFileSync(
      path.join(promptBasePath, 'response-schema.json'),
      JSON.stringify({ type: 'object', properties: { prompt: { type: 'string' } } }),
    );

    try {
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          basePath: providerBasePath,
          responseSchema: 'file://response-schema.json',
          generationConfig: {
            response_mime_type: 'text/plain',
          },
        },
      });

      await provider.callApi('Locate the target.', {
        prompt: {
          config: {
            basePath: promptBasePath,
            responseSchema: 'file://response-schema.json',
          },
        },
      } as any);

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(request.body as string).response_format).toEqual([
        {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: { prompt: { type: 'string' } },
          },
        },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it.each([
    {
      providerConfig: {
        generationConfig: {
          response_schema: '{"type":"object","properties":{"provider":{"type":"string"}}}',
        },
      },
      promptConfig: {
        responseSchema: '{"type":"object","properties":{"prompt":{"type":"string"}}}',
      },
    },
    {
      providerConfig: {
        responseSchema: '{"type":"object","properties":{"provider":{"type":"string"}}}',
      },
      promptConfig: {
        generationConfig: {
          response_schema: '{"type":"object","properties":{"prompt":{"type":"string"}}}',
        },
      },
    },
  ])(
    'lets prompt structured-output config override provider aliases',
    async ({ providerConfig, promptConfig }) => {
      mockFetchWithCache.mockResolvedValue({
        data: { status: 'completed', steps: [] },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          apiKey: 'test-key',
          ...providerConfig,
        },
      });

      await provider.callApi('Locate the target.', {
        prompt: { config: promptConfig },
      } as any);

      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(request.body as string).response_format).toEqual([
        {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: { prompt: { type: 'string' } },
          },
        },
      ]);
    },
  );

  it('lets prompt structured output override a provider passthrough response format', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: {
          response_format: [{ type: 'text', mime_type: 'text/plain' }],
        },
      },
    });

    await provider.callApi('Locate the target.', {
      prompt: {
        config: {
          responseSchema:
            '{"type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"]}',
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).response_format).toEqual([
      {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
        },
      },
    ]);
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

  it('lets a prompt thinkingLevel override an inherited provider thinkingBudget', async () => {
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

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'MEDIUM' },
          },
        },
      },
    } as any);

    expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      thinking_level: 'medium',
    });
  });

  it('lets provider passthrough snake-case thinking_level override provider thinkingBudget', async () => {
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
        passthrough: {
          generation_config: { thinking_level: 'HIGH' },
        },
      },
    });

    await provider.callApi('Plan the next movement.');

    expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      thinking_level: 'high',
    });
  });

  it('lets prompt passthrough snake-case thinking_level override prompt thinking_budget', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          generationConfig: {
            thinking_config: { thinking_budget: 1_024 },
          },
          passthrough: {
            generation_config: {
              thinking_config: { thinking_level: 'MEDIUM' },
            },
          },
        },
      },
    } as any);

    expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      thinking_level: 'medium',
    });
  });

  it('rejects a higher-precedence prompt thinking_budget after a provider level override', async () => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        generationConfig: {
          thinkingConfig: { thinkingBudget: 1_024 },
        },
        passthrough: {
          generation_config: { thinking_level: 'HIGH' },
        },
      },
    });

    await expect(
      provider.callApi('Plan the next movement.', {
        prompt: {
          config: {
            generationConfig: { thinking_budget: 512 },
          },
        },
      } as any),
    ).resolves.toEqual({
      error:
        'Gemini Interactions generation_config does not support numeric thinkingBudget; use thinking_level instead.',
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

  it('lets prompt generation controls override provider passthrough defaults', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: {
          generation_config: {
            max_output_tokens: 1_024,
            stop_sequences: ['PROVIDER'],
          },
        },
      },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          maxOutputTokens: 512,
          stopSequences: ['PROMPT'],
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual({
      max_output_tokens: 512,
      stop_sequences: ['PROMPT'],
    });
  });

  it('merges provider and prompt passthrough before applying prompt precedence', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { status: 'completed', steps: [] },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: {
          user_metadata: { source: 'provider' },
          generation_config: {
            max_output_tokens: 1_024,
            seed: 1,
          },
        },
      },
    });

    await provider.callApi('Plan the next movement.', {
      prompt: {
        config: {
          maxOutputTokens: 512,
          passthrough: {
            generation_config: { seed: 2 },
          },
        },
      },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.user_metadata).toEqual({ source: 'provider' });
    expect(body.generation_config).toEqual({
      max_output_tokens: 512,
      seed: 2,
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

  it.each(['flex', 'standard', 'priority'] as const)(
    'forwards config service tier %s at the Interactions top level',
    async (serviceTier) => {
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
    },
  );

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

  it('lets prompt service_tier override a provider passthrough default', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'robot plan' }] }],
        usage: {
          total_input_tokens: 1_000_000,
          total_output_tokens: 1_000_000,
          total_tokens: 2_000_000,
        },
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { model: 'gemini-3.5-flash', service_tier: 'priority' },
      },
    });

    const result = await provider.callApi('Plan the next movement.', {
      prompt: { config: { service_tier: 'standard' } },
    } as any);

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).service_tier).toBe('standard');
    expect(result.cost).toBeCloseTo(10.5, 10);
  });

  it('rejects a provider passthrough override to a Live-only model before dispatch', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'wrong route' }] }],
      },
      cached: false,
    } as any);
    const modelName = 'gemini-3.5-live-translate-preview';
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { model: modelName },
      },
    });

    const result = await provider.callApi('Translate this audio.');

    expect(result.error).toContain(`Use google:live:${modelName}`);
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects a prompt passthrough override to a Live-only model before dispatch', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'wrong route' }] }],
      },
      cached: false,
    } as any);
    const modelName = 'gemini-robotics-er-2-streaming-preview';
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Plan the next movement.', {
      prompt: { config: { passthrough: { model: modelName } } },
    } as any);

    expect(result.error).toContain(`Use google:live:${modelName}`);
    expect(mockFetchWithCache).not.toHaveBeenCalled();
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

  it('returns only model output after the final managed-tool step', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'I will search for the current answer.' }],
          },
          { type: 'google_search_call' },
          { type: 'google_search_result' },
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'The grounded final answer.' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: {
        apiKey: 'test-key',
        passthrough: { tools: [{ type: 'google_search' }] },
      },
    });

    const result = await provider.callApi('Find the current answer.');

    expect(result.output).toBe('The grounded final answer.');
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

  it.each([
    {
      name: 'an explicit API key',
      config: { apiKey: 'vertex-express-key' },
      env: undefined,
    },
    {
      name: 'expressMode with VERTEX_API_KEY',
      config: { expressMode: true },
      env: { VERTEX_API_KEY: 'vertex-express-key' },
    },
    {
      name: 'expressMode overriding projectId with VERTEX_API_KEY',
      config: { expressMode: true, projectId: 'configured-project' },
      env: { VERTEX_API_KEY: 'vertex-express-key' },
    },
  ])('uses Vertex Express authentication for Robotics with $name', async ({ config, env }) => {
    const oauthSpy = vi
      .spyOn(GoogleAuthManager, 'getOAuthClient')
      .mockRejectedValue(new Error('OAuth must not run for Vertex Express'));
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: 'Move forward.' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true, ...config },
      env,
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(oauthSpy).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Api-Revision': '2026-05-20',
          'x-goog-api-key': 'vertex-express-key',
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('prefers provider-scoped GOOGLE_API_KEY over process VERTEX_API_KEY for Vertex Express', async () => {
    vi.stubEnv('VERTEX_API_KEY', 'ambient-vertex-key');
    const oauthSpy = vi
      .spyOn(GoogleAuthManager, 'getOAuthClient')
      .mockRejectedValue(new Error('OAuth must not run for Vertex Express'));
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true },
      env: { GOOGLE_API_KEY: 'provider-google-key' },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(oauthSpy).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'provider-google-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('rejects regional Vertex Express Interactions before network I/O', async () => {
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: {
        vertexai: true,
        apiKey: 'vertex-express-key',
        region: 'europe-west1',
      },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toContain('Vertex Express');
    expect(result.error).toContain('global');
    expect(result.error).toContain('expressMode: false');
    expect(mockFetchWithCache).not.toHaveBeenCalled();
  });

  it('accepts provider-scoped global for Vertex Express over process VERTEX_REGION', async () => {
    vi.stubEnv('VERTEX_REGION', 'europe-west1');
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true, apiKey: 'vertex-express-key' },
      env: { GOOGLE_CLOUD_LOCATION: 'global' },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'vertex-express-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('uses provider-scoped VERTEX_API_KEY with global region for Vertex Express', async () => {
    const oauthSpy = vi
      .spyOn(GoogleAuthManager, 'getOAuthClient')
      .mockRejectedValue(new Error('OAuth must not run for Vertex Express'));
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true, region: 'global' },
      env: { VERTEX_API_KEY: 'provider-vertex-key' },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(oauthSpy).not.toHaveBeenCalled();
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'provider-vertex-key' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('keeps an explicit project on Vertex OAuth despite provider-scoped VERTEX_API_KEY', async () => {
    const endpoint =
      'https://aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/global/interactions';
    const getRequestHeaders = vi
      .fn()
      .mockResolvedValue(new Headers({ Authorization: 'Bearer vertex-token' }));
    const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
        getRequestHeaders,
      },
      projectId: 'detected-project',
    });
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true, projectId: 'configured-project' },
      env: { VERTEX_API_KEY: 'provider-vertex-key' },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(getOAuthClient).toHaveBeenCalledTimes(1);
    expect(getRequestHeaders).toHaveBeenCalledWith(endpoint);
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer vertex-token' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).not.toHaveProperty('x-goog-api-key');
  });

  it('keeps a provider-scoped project on Vertex OAuth despite provider-scoped VERTEX_API_KEY', async () => {
    const endpoint =
      'https://aiplatform.googleapis.com/v1beta1/projects/provider-project/locations/global/interactions';
    const getRequestHeaders = vi
      .fn()
      .mockResolvedValue(new Headers({ Authorization: 'Bearer vertex-token' }));
    const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
        getRequestHeaders,
      },
      projectId: 'detected-project',
    });
    mockFetchWithCache.mockResolvedValue({
      data: {
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: { vertexai: true },
      env: {
        VERTEX_API_KEY: 'provider-vertex-key',
        GOOGLE_CLOUD_PROJECT: 'provider-project',
      },
    });

    const result = await provider.callApi('Move the block.');

    expect(result.error).toBeUndefined();
    expect(getOAuthClient).toHaveBeenCalledTimes(1);
    expect(getRequestHeaders).toHaveBeenCalledWith(endpoint);
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer vertex-token' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).not.toHaveProperty('x-goog-api-key');
  });

  for (const { conflictingField, conflictingValue } of [
    { conflictingField: 'projectId', conflictingValue: 'configured-project' },
    { conflictingField: 'region', conflictingValue: 'global' },
  ]) {
    it(`rejects strict explicit apiKey with ${conflictingField}`, () => {
      expect(
        () =>
          new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
            config: {
              vertexai: true,
              apiKey: 'vertex-express-key',
              [conflictingField]: conflictingValue,
              strictMutualExclusivity: true,
            },
          }),
      ).toThrow('Project/location and API key are mutually exclusive');
    });
  }

  it.each([
    { name: 'provider-scoped', env: { GOOGLE_API_KEY: 'unrelated-key' } },
    { name: 'process-scoped', env: undefined },
  ])(
    'keeps project and regional Vertex OAuth when an unrelated $name GOOGLE_API_KEY exists',
    async ({ name, env }) => {
      if (name === 'process-scoped') {
        vi.stubEnv('GOOGLE_API_KEY', 'unrelated-key');
      }
      const endpoint =
        'https://europe-west1-aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/europe-west1/interactions';
      const oauthHeaders = new Headers({
        Authorization: 'Bearer vertex-token',
        'x-goog-user-project': 'quota-project',
      });
      const getRequestHeaders = vi.fn().mockResolvedValue(oauthHeaders);
      const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
        client: {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
          getRequestHeaders,
        },
        projectId: 'detected-project',
      });
      mockFetchWithCache.mockResolvedValue({
        data: {
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        id: 'vertex:gemini-robotics-er-2-preview',
        config: {
          vertexai: true,
          projectId: 'configured-project',
          region: 'europe-west1',
        },
        env,
      });

      const result = await provider.callApi('Move the block.');

      expect(result.error).toBeUndefined();
      expect(getOAuthClient).toHaveBeenCalledTimes(1);
      expect(getRequestHeaders).toHaveBeenCalledWith(endpoint);
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer vertex-token',
            'x-goog-user-project': 'quota-project',
          }),
        }),
        expect.any(Number),
        'json',
        true,
      );
      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(request.headers).not.toHaveProperty('x-goog-api-key');
    },
  );

  it.each([
    {
      name: 'provider-scoped GOOGLE_CLOUD_PROJECT',
      env: { GOOGLE_API_KEY: 'unrelated-key', GOOGLE_CLOUD_PROJECT: 'provider-project' },
      processEnv: {},
      endpoint:
        'https://aiplatform.googleapis.com/v1beta1/projects/provider-project/locations/global/interactions',
    },
    {
      name: 'process-scoped GOOGLE_CLOUD_PROJECT',
      env: undefined,
      processEnv: {
        GOOGLE_API_KEY: 'unrelated-key',
        GOOGLE_CLOUD_PROJECT: 'process-project',
      },
      endpoint:
        'https://aiplatform.googleapis.com/v1beta1/projects/process-project/locations/global/interactions',
    },
    {
      name: 'provider-scoped GOOGLE_CLOUD_LOCATION',
      env: { GOOGLE_API_KEY: 'unrelated-key', GOOGLE_CLOUD_LOCATION: 'europe-west1' },
      processEnv: {},
      endpoint:
        'https://europe-west1-aiplatform.googleapis.com/v1beta1/projects/detected-project/locations/europe-west1/interactions',
    },
    {
      name: 'process-scoped GOOGLE_CLOUD_LOCATION',
      env: undefined,
      processEnv: {
        GOOGLE_API_KEY: 'unrelated-key',
        GOOGLE_CLOUD_LOCATION: 'europe-west1',
      },
      endpoint:
        'https://europe-west1-aiplatform.googleapis.com/v1beta1/projects/detected-project/locations/europe-west1/interactions',
    },
  ])(
    'treats $name as Vertex OAuth intent despite an unrelated API key',
    async ({ env, processEnv, endpoint }) => {
      vi.stubEnv('VERTEX_API_KEY', '');
      for (const [name, value] of Object.entries(processEnv)) {
        vi.stubEnv(name, value);
      }
      const oauthHeaders = new Headers({ Authorization: 'Bearer vertex-token' });
      const getRequestHeaders = vi.fn().mockResolvedValue(oauthHeaders);
      const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
        client: {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
          getRequestHeaders,
        },
        projectId: 'detected-project',
      });
      mockFetchWithCache.mockResolvedValue({
        data: {
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Move forward.' }] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        id: 'vertex:gemini-robotics-er-2-preview',
        config: { vertexai: true },
        env,
      });

      const result = await provider.callApi('Move the block.');

      expect(result.error).toBeUndefined();
      expect(getOAuthClient).toHaveBeenCalledTimes(1);
      expect(getRequestHeaders).toHaveBeenCalledWith(endpoint);
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer vertex-token' }),
        }),
        expect.any(Number),
        'json',
        true,
      );
      const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
      expect(request.headers).not.toHaveProperty('x-goog-api-key');
    },
  );

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
          generation_config: { temperature: 0.2, top_p: 0.9 },
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

  it('uses a provider-scoped GOOGLE_CLOUD_LOCATION for Vertex Interactions', async () => {
    vi.stubEnv('VERTEX_REGION', 'europe-west1');
    const oauthHeaders = new Headers({ Authorization: 'Bearer vertex-token' });
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
            content: [{ type: 'text', text: 'Move forward.' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { vertexai: true, projectId: 'configured-project' },
      env: { GOOGLE_CLOUD_LOCATION: 'us-central1' },
    });

    const result = await provider.callApi('Move the block.');

    const endpoint =
      'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/us-central1/interactions';
    expect(result.error).toBeUndefined();
    expect(getRequestHeaders).toHaveBeenCalledWith(endpoint);
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer vertex-token' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it.each([
    [
      'top-level provider options',
      { temperature: 0.2, topP: 0.9 },
      { temperature: 0.2, top_p: 0.9 },
    ],
    [
      'camelCase generationConfig',
      { generationConfig: { temperature: 0.3, topP: 0.8 } },
      { temperature: 0.3, top_p: 0.8 },
    ],
    [
      'snake_case passthrough generation_config',
      { passthrough: { generation_config: { temperature: 0.4, top_p: 0.7 } } },
      { temperature: 0.4, top_p: 0.7 },
    ],
  ])('preserves Vertex Omni sampling controls from %s', async (_description, options, expected) => {
    const oauthHeaders = new Headers({ Authorization: 'Bearer vertex-token' });
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'vertex-token' }),
        getRequestHeaders: vi.fn().mockResolvedValue(oauthHeaders),
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
        ...options,
      },
    });

    await provider.callApi('A city at dusk');

    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string).generation_config).toEqual(expected);
  });

  it('allows Vertex Robotics follow-up interactions', async () => {
    const oauthHeaders = new Headers();
    oauthHeaders.set('Authorization', 'Bearer vertex-token');
    const getRequestHeaders = vi.fn().mockResolvedValue(oauthHeaders);
    const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
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
            content: [{ type: 'text', text: 'Continue forward.' }],
          },
        ],
      },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      id: 'vertex:gemini-robotics-er-2-preview',
      config: {
        vertexai: true,
        projectId: 'configured-project',
        previousInteractionId: 'interaction-0',
      },
    });

    const result = await provider.callApi('Continue the movement plan.');

    expect(result.error).toBeUndefined();
    expect(getOAuthClient).toHaveBeenCalledTimes(1);
    expect(getRequestHeaders).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/global/interactions',
    );
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1beta1/projects/configured-project/locations/global/interactions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer vertex-token' }),
      }),
      expect.any(Number),
      'json',
      true,
    );
    const request = mockFetchWithCache.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: 'gemini-robotics-er-2-preview',
      previous_interaction_id: 'interaction-0',
    });
  });

  it('uses a model-neutral error for Vertex Interactions authentication failures', async () => {
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockRejectedValueOnce(
      new Error('credential lookup failed'),
    );
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { vertexai: true },
    });

    await expect(provider.callApi('Move the block.')).resolves.toEqual({
      error:
        'Gemini Interactions on Vertex AI authentication error: Error: credential lookup failed',
    });
  });

  it('uses a model-neutral error when Vertex Interactions cannot resolve a project', async () => {
    vi.stubEnv('VERTEX_PROJECT_ID', '');
    vi.stubEnv('GOOGLE_PROJECT_ID', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: { getAccessToken: vi.fn() },
      projectId: undefined,
    });
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { vertexai: true },
    });

    await expect(provider.callApi('Move the block.')).resolves.toEqual({
      error:
        'Gemini Interactions on Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT or add projectId to the provider config.',
    });
  });

  it('uses a model-neutral error when Vertex Interactions cannot obtain an access token', async () => {
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
      client: { getAccessToken: vi.fn().mockResolvedValue(undefined) },
      projectId: 'configured-project',
    });
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { vertexai: true, projectId: 'configured-project' },
    });

    await expect(provider.callApi('Move the block.')).resolves.toEqual({
      error: 'Gemini Interactions on Vertex AI could not obtain an OAuth access token.',
    });
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

  it.each([{ tools: [] }, { passthrough: { tools: [] } }])(
    'allows an empty Omni tools list: %j',
    async (toolConfig) => {
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
    },
  );

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
    ['apiHost', { apiHost: 'https://prompt-host.example' }],
    ['apiBaseUrl', { apiBaseUrl: 'https://prompt-base.example/google' }],
  ])(
    'keeps AI Studio authentication and transport provider-scoped when the prompt supplies %s',
    async (_field, endpointOverride) => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'safe' }] }],
        },
        cached: false,
      } as any);
      const oauthSpy = vi.spyOn(GoogleAuthManager, 'getOAuthClient');
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          vertexai: false,
          apiKey: 'provider-key',
          apiBaseUrl: 'https://provider-base.example/google',
          headers: { 'x-provider-header': 'provider-value' },
        },
      });

      const result = await provider.callApi('move the block', {
        prompt: {
          config: {
            ...endpointOverride,
            apiKey: 'prompt-key',
            headers: {
              Authorization: 'Bearer prompt-token',
              'x-goog-api-key': 'prompt-header-key',
            },
          },
        },
      } as any);

      expect(result.error).toBeUndefined();
      expect(oauthSpy).not.toHaveBeenCalled();
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://provider-base.example/google/v1beta/interactions',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Api-Revision': '2026-05-20',
            'x-goog-api-key': 'provider-key',
            'x-provider-header': 'provider-value',
          },
        }),
        expect.any(Number),
        'json',
        true,
      );
    },
  );

  it.each([
    ['apiHost', { apiHost: 'https://prompt-vertex-host.example' }],
    ['apiBaseUrl', { apiBaseUrl: 'https://prompt-vertex-base.example' }],
  ])(
    'keeps Vertex authentication and transport provider-scoped when the prompt supplies %s',
    async (_field, endpointOverride) => {
      const oauthHeaders = new Headers({ Authorization: 'Bearer provider-token' });
      const getRequestHeaders = vi.fn().mockResolvedValue(oauthHeaders);
      const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValueOnce({
        client: {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'provider-token' }),
          getRequestHeaders,
        },
        projectId: 'detected-project',
      });
      mockFetchWithCache.mockResolvedValue({
        data: {
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'safe' }] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: {
          vertexai: true,
          apiBaseUrl: 'https://provider-vertex.example',
          projectId: 'provider-project',
          region: 'provider-region',
          credentials: 'provider-credentials',
          googleAuthOptions: { universeDomain: 'provider.example' },
          keyFilename: '/provider/key.json',
          scopes: ['provider-scope'],
          headers: { 'x-provider-header': 'provider-value' },
        },
      });

      const result = await provider.callApi('move the block', {
        prompt: {
          config: {
            ...endpointOverride,
            projectId: 'prompt-project',
            region: 'prompt-region',
            credentials: 'prompt-credentials',
            googleAuthOptions: { universeDomain: 'prompt.example' },
            keyFilename: '/prompt/key.json',
            scopes: ['prompt-scope'],
            headers: { Authorization: 'Bearer prompt-token' },
          },
        },
      } as any);

      const providerEndpoint =
        'https://provider-vertex.example/v1beta1/projects/provider-project/locations/provider-region/interactions';
      expect(result.error).toBeUndefined();
      expect(getOAuthClient).toHaveBeenCalledWith({
        credentials: 'provider-credentials',
        googleAuthOptions: { universeDomain: 'provider.example' },
        keyFilename: '/provider/key.json',
        scopes: ['provider-scope'],
      });
      expect(getRequestHeaders).toHaveBeenCalledWith(providerEndpoint);
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        providerEndpoint,
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Api-Revision': '2026-05-20',
            Authorization: 'Bearer provider-token',
            'x-provider-header': 'provider-value',
          },
        }),
        expect.any(Number),
        'json',
        true,
      );
    },
  );

  it.each([
    {
      name: 'AI Studio',
      providerConfig: { vertexai: false, apiKey: 'provider-key' },
      promptConfig: { vertexai: true },
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      usesOAuth: false,
    },
    {
      name: 'Vertex',
      providerConfig: { vertexai: true, projectId: 'provider-project' },
      promptConfig: { vertexai: false, apiKey: 'prompt-key' },
      endpoint:
        'https://aiplatform.googleapis.com/v1beta1/projects/provider-project/locations/global/interactions',
      usesOAuth: true,
    },
  ])(
    'does not let a prompt switch the provider-scoped $name authentication mode',
    async (testCase) => {
      const oauthHeaders = new Headers({ Authorization: 'Bearer provider-token' });
      const getOAuthClient = vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
        client: {
          getAccessToken: vi.fn().mockResolvedValue({ token: 'provider-token' }),
          getRequestHeaders: vi.fn().mockResolvedValue(oauthHeaders),
        },
        projectId: 'detected-project',
      });
      mockFetchWithCache.mockResolvedValue({
        data: {
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'safe' }] }],
        },
        cached: false,
      } as any);
      const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
        config: testCase.providerConfig,
      });

      const result = await provider.callApi('move the block', {
        prompt: { config: testCase.promptConfig },
      } as any);

      expect(result.error).toBeUndefined();
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        testCase.endpoint,
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
      expect(getOAuthClient).toHaveBeenCalledTimes(testCase.usesOAuth ? 1 : 0);
    },
  );

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
  ])(
    'prefers explicit interaction endpoints and preserves HTTP schemes',
    async (config, env, endpoint) => {
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
    },
  );

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

  it('uses a prompt timeout of zero instead of the provider polling timeout', async () => {
    mockFetchWithCache.mockResolvedValue({
      data: { id: 'interaction-prompt-timeout', status: 'in_progress' },
      cached: false,
    } as any);
    const provider = new GoogleInteractionsProvider('gemini-omni-flash-preview', {
      config: { apiKey: 'test-key', timeoutMs: 30 },
    });

    await expect(
      provider.callApi('make it rainy', {
        prompt: { config: { timeoutMs: 0 } },
      } as any),
    ).resolves.toMatchObject({
      error: 'Gemini interaction timed out after 0ms (status: in_progress)',
    });
  });

  it('falls back to the provider polling timeout when the prompt omits it', async () => {
    mockFetchWithCache
      .mockResolvedValueOnce({
        data: { id: 'interaction-provider-timeout', status: 'in_progress' },
        cached: false,
      } as any)
      .mockResolvedValueOnce({
        data: {
          id: 'interaction-provider-timeout',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'done' }] }],
        },
        cached: false,
      } as any);
    const provider = new GoogleInteractionsProvider('gemini-robotics-er-2-preview', {
      config: { apiKey: 'test-key', timeoutMs: 30 },
    });

    const result = await provider.callApi('move the block', {
      prompt: { config: {} },
    } as any);

    const pollTimeoutMs = mockFetchWithCache.mock.calls[1][2] as number;
    expect(result.error).toBeUndefined();
    expect(pollTimeoutMs).toBeGreaterThan(0);
    expect(pollTimeoutMs).toBeLessThanOrEqual(30);
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
