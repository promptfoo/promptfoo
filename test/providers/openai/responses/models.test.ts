// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../../src/cache';
import { loadApiProvider } from '../../../../src/providers';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

const unsupportedAudioModels = [
  'gpt-audio',
  'gpt-audio-2025-08-28',
  'gpt-audio-1.5',
  'gpt-audio-mini',
  'gpt-audio-mini-2025-12-15',
  'gpt-audio-mini-2025-10-06',
] as const;

describe('OpenAiResponsesProvider model registry', () => {
  it.each([
    'codex-mini-latest',
    'gpt-5-chat',
    'gpt-5-chat-latest',
    'gpt-5.1-chat-latest',
    'gpt-5.2-chat-latest',
    'gpt-5.3-chat-latest',
    'o1-mini',
    'o1-mini-2024-09-12',
    'o1-preview',
    'o1-preview-2024-09-12',
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research',
    'o4-mini-deep-research-2025-06-26',
  ])('does not advertise retired model %s', (model) => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain(model);
  });

  it('should support various model names', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    // GPT-5 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-sol');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-terra');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-luna');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-6-sol');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-6.1-sol');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-6-luna');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5-2026-04-23');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.5-pro-2026-04-23',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-2026-03-05');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-mini-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-nano-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-pro-2026-03-05',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
    for (const model of unsupportedAudioModels) {
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain(model);
    }
  });

  it('should support the latest o-series reasoning models', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
  });

  it('should support gpt-4.1 and its variants', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-mini-2025-04-14',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-nano-2025-04-14',
    );
  });

  it('should support gpt-5 and its variants', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
  });

  it('should include all expected model names', async () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain('gpt-4o-2024-07-18');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-08-06');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-11-20');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-05-13');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-2024-12-17');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro-2025-03-19');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro-2025-06-10');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini-2025-01-31');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-codex-mini');
    // GPT-5.1 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain('gpt-5.1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain('gpt-5.1-nano');
    // GPT-5.2 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.2-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.2-pro-2025-12-11',
    );
    // GPT-5.3 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.3-codex');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain(
      'gpt-5.3-codex-spark',
    );
    // GPT-5.6 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-sol');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-terra');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.6-luna');
    // GPT-5.5 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5-2026-04-23');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.5-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.5-pro-2026-04-23',
    );
    // GPT-5.4 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-2026-03-05');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-mini-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-nano-2026-03-17',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5.4-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-5.4-pro-2026-03-05',
    );
    // Audio models are Chat Completions-only while Responses audio remains unsupported.
    for (const model of unsupportedAudioModels) {
      expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).not.toContain(model);
    }
  });
});

describe('Responses-only model requests', () => {
  it.each([
    ['computer-use-preview', 0.009],
    ['computer-use-preview-2025-03-11', 0.009],
    ['gpt-5-codex', 0.00625],
    ['gpt-5.1-codex', 0.00625],
    ['gpt-5.1-codex-max', 0.00625],
    ['gpt-5.1-codex-mini', 0.00125],
    ['gpt-5.2-codex', 0.00875],
  ])('sends bare selector %s to Responses and preserves its cost', async (model, cost) => {
    const provider = await loadApiProvider(`openai:${model}`, {
      options: { config: { apiKey: 'fixture-key' } },
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        status: 'completed',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] },
        ],
        usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const response = await provider.callApi('Say hello');

    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(request?.method).toBe('POST');
    expect(JSON.parse(request?.body as string)).toMatchObject({ model, input: 'Say hello' });
    expect(response.error).toBeUndefined();
    expect(response.output).toBe('Hello');
    expect(response.tokenUsage).toMatchObject({ prompt: 1000, completion: 500, total: 1500 });
    expect(response.cost).toBeCloseTo(cost, 8);
  });

  it('returns the Responses API error for a restored bare selector', async () => {
    const provider = await loadApiProvider('openai:gpt-5.1-codex', {
      options: { config: { apiKey: 'fixture-key' } },
    });
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        error: {
          message: 'Model unavailable',
          type: 'invalid_request_error',
          code: 'model_not_found',
        },
      },
      cached: false,
      status: 404,
      statusText: 'Not Found',
    });

    const response = await provider.callApi('Say hello');

    expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect(response.error).toContain('Model unavailable');
    expect(response.output).toBeUndefined();
  });
});
