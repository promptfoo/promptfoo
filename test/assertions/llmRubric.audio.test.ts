import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleLlmRubric } from '../../src/assertions/llmRubric';
import { fetchWithCache } from '../../src/cache';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';

import type { ApiProvider, AssertionParams, ProviderResponse } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('llm-rubric audio grading', () => {
  const audio = { data: 'UklGRgAAAABXQVZF', format: 'wav', transcript: 'Hello.' };

  function grade(
    provider: ApiProvider,
    targetAudio: ProviderResponse['audio'] = audio,
    overrides: Partial<AssertionParams> = {},
  ) {
    return handleLlmRubric({
      assertion: { type: 'llm-rubric', value: 'The speaker sounds calm.' },
      baseType: 'llm-rubric',
      assertionValueContext: { prompt: 'Say hello', vars: {}, test: {} },
      inverse: false,
      renderedValue: 'The speaker sounds calm.',
      output: 'Hello.',
      outputString: 'Hello.',
      test: {
        options: {
          provider,
          rubricPrompt: [
            { role: 'system', content: 'Return a JSON grade.' },
            { role: 'user', content: 'Grade {{output}} for {{rubric}}' },
          ],
        },
      },
      providerResponse: { output: 'Hello.', audio: targetAudio },
      ...overrides,
    } as AssertionParams);
  }

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      data: {
        choices: [
          { message: { content: JSON.stringify({ pass: true, score: 1, reason: 'Calm.' }) } },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ['gpt-audio-1.5', 'voice-quality-judge'],
    ['gpt-4o-audio-preview', 'voice-quality-judge'],
    ['gpt-4o-mini-audio-preview', 'voice-quality-judge'],
    ['gpt-audio-1.5', 'responses:voice-quality-judge'],
    ['gpt-audio-1.5', 'google:voice-quality-judge'],
  ])('sends native audio through the Chat transport for %s with ID %s', async (model, id) => {
    const provider = new OpenAiChatCompletionProvider(model, {
      id,
      config: { modalities: ['text'] },
    });
    const result = await grade(provider);
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
    expect(body.model).toBe(model);
    expect(body.modalities).toEqual(['text']);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Return a JSON grade.' });
    expect(body.messages[1].content[0]).toEqual({
      type: 'text',
      text: 'Grade Hello. for The speaker sounds calm.',
    });
    expect(body.messages[1].content).toContainEqual({
      type: 'input_audio',
      input_audio: { data: audio.data, format: 'wav' },
    });
    expect(result).toMatchObject({ pass: true, score: 1, tokensUsed: { total: 30 } });
    expect(result.metadata?.renderedGradingPromptAudio).toBe(true);
    expect(result.metadata?.renderedGradingPrompt).not.toContain(audio.data);
  });

  it('accepts MP3 and preserves a failing grade', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
    vi.spyOn(provider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: false, score: 0.2, reason: 'Speech is clipped.' }),
    });
    expect(await grade(provider, { ...audio, format: 'mp3' })).toMatchObject({
      pass: false,
      score: 0.2,
    });
    expect(JSON.parse(vi.mocked(provider.callApi).mock.calls[0][0])[1].content).toContainEqual({
      type: 'input_audio',
      input_audio: { data: audio.data, format: 'mp3' },
    });
  });

  it.each([undefined, 'Hello.'])(
    'removes duplicated audio from grading text with transcript %s',
    async (transcript) => {
      const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
      const targetAudio = { ...audio, transcript };
      const result = await grade(provider, targetAudio, {
        output: audio.data,
        outputString: audio.data,
        providerResponse: { output: audio.data, isBase64: true, audio: targetAudio },
      });
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
      expect(body.messages[1].content[0]).toEqual({
        type: 'text',
        text: `Grade ${transcript || '[Audio output]'} for The speaker sounds calm.`,
      });
      expect(body.messages[1].content).toContainEqual({
        type: 'input_audio',
        input_audio: { data: audio.data, format: 'wav' },
      });
      expect(result.metadata?.renderedGradingPrompt).not.toContain(audio.data);
    },
  );

  it('accepts line-wrapped base64 at the decoded audio size limit', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
    const data = Buffer.alloc(20 * 1024 * 1024).toString('base64');
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({
      output: '{"pass":true,"score":1}',
    });
    const result = await grade(provider, { ...audio, data: data.replace(/.{76}/g, '$&\r\n') });
    expect(result.pass).toBe(true);
    const parts = JSON.parse(call.mock.calls[0][0])[1].content;
    expect(
      parts.find((part: { type: string }) => part.type === 'input_audio').input_audio.data,
    ).toBe(data);
  });

  it.each([new OpenAiChatCompletionProvider('gpt-4.1'), new OpenAiResponsesProvider('gpt-5.6')])(
    'keeps transcript grading for a text grader ($modelName)',
    async (provider) => {
      const call = vi
        .spyOn(provider, 'callApi')
        .mockResolvedValue({ output: '{"pass":true,"score":1}' });
      const result = await grade(provider, { transcript: 'Hello.' });
      expect(JSON.parse(call.mock.calls[0][0])[1].content).toBe(
        'Grade Hello. for The speaker sounds calm.',
      );
      expect(result.metadata).not.toHaveProperty('renderedGradingPromptAudio');
    },
  );

  it('does not attach original audio after an assertion transform', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
    const result = await grade(provider, audio, {
      assertion: { type: 'llm-rubric', value: 'Contains hello', transform: 'output.toLowerCase()' },
    });
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
    expect(body.messages[1].content).toBe('Grade Hello. for The speaker sounds calm.');
    expect(result.metadata).not.toHaveProperty('renderedGradingPromptAudio');
  });

  it.each([
    [{ format: 'wav' }, 'valid base64'],
    [{ ...audio, data: 'not base64!' }, 'valid base64'],
    [{ ...audio, format: 'pcm16' }, 'WAV or MP3'],
    [{ ...audio, format: undefined }, 'WAV or MP3'],
    [{ ...audio, data: 'A'.repeat(28 * 1024 * 1024) }, '20 MiB'],
    [{ ...audio, data: `promptfoo://blob/${'a'.repeat(64)}` }, 'blob references'],
  ] as const)(
    'rejects unsupported audio before contacting the grader',
    async (targetAudio, error) => {
      const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
      await expect(grade(provider, targetAudio, { inverse: true })).rejects.toThrow(error);
      expect(fetchWithCache).not.toHaveBeenCalled();
    },
  );

  it('preserves cached grading metadata without embedding audio bytes', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-audio-1.5');
    vi.spyOn(provider, 'callApi').mockResolvedValue({
      output: '{"pass":true,"score":1}',
      cached: true,
      tokenUsage: { total: 30, cached: 30 },
    });
    const result = await grade(provider);
    expect(result.metadata).toMatchObject({
      cachedResponse: true,
      renderedGradingPromptAudio: true,
    });
    expect(result.tokensUsed?.cached).toBe(30);
    expect(JSON.stringify(result)).not.toContain(audio.data);
  });
});
