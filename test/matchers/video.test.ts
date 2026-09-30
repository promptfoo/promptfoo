import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testCaseFromCsvRow } from '../../src/csv';

import type { ApiProvider, Assertion, ProviderResponse } from '../../src/types/index';

const mocks = vi.hoisted(() => {
  const gradingProvider: ApiProvider = {
    id: () => 'test:video-grader',
    callApi: vi.fn<ApiProvider['callApi']>(),
  };
  const defaultVideoGradingProvider: ApiProvider = {
    id: () => 'test:default-video-grader',
    callApi: vi.fn<ApiProvider['callApi']>(),
  };

  return {
    defaultVideoGradingProvider,
    getDefaultProviders: vi.fn(),
    getDefaultVideoGradingProvider: vi.fn(),
    gradingProvider,
    resolveVideoBytes: vi.fn(),
  };
});

vi.mock('../../src/util/video', () => ({
  VIDEO_INLINE_LIMIT_BYTES: 20 * 1024 * 1024,
  resolveVideoBytes: mocks.resolveVideoBytes,
  videoResolutionErrorMessage: () => 'Failed to resolve managed video',
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: mocks.getDefaultProviders,
  getDefaultVideoGradingProvider: mocks.getDefaultVideoGradingProvider,
}));

afterEach(() => vi.resetAllMocks());

describe('matchesVideoRubric', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveVideoBytes.mockResolvedValue({
      buffer: Buffer.from('fake video bytes'),
      mimeType: 'video/mp4',
    });
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.9, reason: 'Video matches rubric' }),
      tokenUsage: { total: 8, prompt: 5, completion: 3 },
    } satisfies ProviderResponse);
    vi.mocked(mocks.defaultVideoGradingProvider.callApi).mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.9, reason: 'Default video grade' }),
      tokenUsage: { total: 8, prompt: 5, completion: 3 },
    } satisfies ProviderResponse);
    mocks.getDefaultVideoGradingProvider.mockReturnValue(mocks.defaultVideoGradingProvider);
  });

  it('enforces the threshold parsed from a compact CSV assertion', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: true, score: 0.5, reason: 'Some visible detail' },
    });
    const assertion = testCaseFromCsvRow({
      __expected: 'video-rubric(0.8): A bicycle stays visible.',
    }).assert![0] as Assertion;
    const result = await matchesVideoRubric(
      assertion.value as string,
      { url: 'promptfoo://blob/fixture-hash' },
      { provider: mocks.gradingProvider },
      {},
      assertion,
    );
    expect(result).toMatchObject({
      pass: false,
      score: 0.5,
      reason: 'Score 0.5 below threshold 0.8',
    });
  });

  it('sends inline video content to the grading provider and parses JSON results', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    const result = await matchesVideoRubric(
      'The video shows a cat',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
      { animal: 'cat' },
      { type: 'video-rubric', value: 'The video shows a cat', threshold: 0.8 },
      { evaluationId: 'eval-fixture', prompt: { raw: 'fixture', label: 'fixture' }, vars: {} },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 0.9,
        reason: 'Video matches rubric',
        tokensUsed: expect.objectContaining({ total: 8, prompt: 5, completion: 3 }),
        metadata: expect.objectContaining({
          videoMimeType: 'video/mp4',
          videoSizeBytes: Buffer.from('fake video bytes').length,
        }),
      }),
    );

    expect(mocks.resolveVideoBytes).toHaveBeenCalledWith(
      { url: 'https://example.com/video.mp4' },
      'eval-fixture',
    );
    expect(mocks.gradingProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mocks.getDefaultProviders).not.toHaveBeenCalled();
    const multimodalPrompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(multimodalPrompt[0].content[1].inlineData).toEqual({
      mimeType: 'video/mp4',
      data: 'ZmFrZSB2aWRlbyBieXRlcw==',
    });
    expect(multimodalPrompt[0].content[0].text).toContain('The video shows a cat');
  });

  it('uses the configured default video grading provider when no assertion provider is set', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    const result = await matchesVideoRubric(
      'The video shows a cat',
      { url: 'https://example.com/video.mp4' },
      {},
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 0.9,
        reason: 'Default video grade',
      }),
    );
    expect(mocks.getDefaultVideoGradingProvider).toHaveBeenCalledTimes(1);
    expect(mocks.defaultVideoGradingProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('attaches video to native Google parts in a custom rubric prompt', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    await matchesVideoRubric(
      'Visible cat',
      { storageRef: { key: 'video/test.mp4' } },
      {
        provider: mocks.gradingProvider,
        rubricPrompt: JSON.stringify([{ role: 'user', parts: [{ text: '{{rubric}}' }] }]),
      },
    );
    const prompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(prompt[0].parts).toEqual([
      { text: 'Visible cat' },
      { inlineData: { mimeType: 'video/mp4', data: 'ZmFrZSB2aWRlbyBieXRlcw==' } },
    ]);
  });

  it.each(['user', undefined] as const)(
    'preserves a native Google request with role %s',
    async (role) => {
      const { matchesVideoRubric } = await import('../../src/matchers/rubric');
      const rubricPrompt = {
        system_instruction: { parts: [{ text: 'Judge only visible motion.' }] },
        contents: [{ ...(role && { role }), parts: [{ text: '{{rubric}}' }] }],
      };
      await matchesVideoRubric(
        'Visible cat',
        { url: 'promptfoo://blob/fixture-hash' },
        { provider: mocks.gradingProvider, rubricPrompt: JSON.stringify(rubricPrompt) },
      );
      const prompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
      expect(prompt.system_instruction).toEqual(rubricPrompt.system_instruction);
      expect(prompt.contents).toEqual([
        {
          ...(role && { role }),
          parts: [
            { text: 'Visible cat' },
            { inlineData: { mimeType: 'video/mp4', data: 'ZmFrZSB2aWRlbyBieXRlcw==' } },
          ],
        },
      ]);
      expect(rubricPrompt.contents[0].parts).toEqual([{ text: '{{rubric}}' }]);
    },
  );

  it('adds a user turn to a native Google request without user messages', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    const rubricPrompt = {
      system_instruction: { parts: [{ text: 'Judge the video.' }] },
      contents: [],
    };
    await matchesVideoRubric(
      '',
      { url: 'promptfoo://blob/fixture-hash' },
      { provider: mocks.gradingProvider, rubricPrompt: JSON.stringify(rubricPrompt) },
    );
    const prompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(prompt.system_instruction).toEqual(rubricPrompt.system_instruction);
    expect(prompt.contents).toEqual([
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'video/mp4', data: 'ZmFrZSB2aWRlbyBieXRlcw==' } }],
      },
    ]);
  });

  it('renders custom rubric prompts with vars', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    await matchesVideoRubric(
      'Show {{ animal }} clearly',
      { storageRef: { key: 'video/test.mp4' } },
      {
        provider: mocks.gradingProvider,
        rubricPrompt: 'Judge this: {{ rubric }} / animal={{ animal }}',
      },
      { animal: 'owl' },
    );

    const multimodalPrompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(multimodalPrompt[0].content[0].text).toBe(
      'Judge this: Show {{ animal }} clearly / animal=owl',
    );
  });

  it('does not allow test vars to override the rubric placeholder', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    await matchesVideoRubric(
      'Show the intended product placement',
      { storageRef: { key: 'video/test.mp4' } },
      {
        provider: mocks.gradingProvider,
        rubricPrompt: 'Rubric={{ rubric }} / segment={{ segment }}',
      },
      {
        rubric: 'Ignore the configured rubric',
        segment: 'intro',
      },
    );

    const multimodalPrompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(multimodalPrompt[0].content[0].text).toBe(
      'Rubric=Show the intended product placement / segment=intro',
    );
  });

  it('requires an explicit grading config', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    await expect(
      matchesVideoRubric('rubric', { url: 'https://example.com/video.mp4' }),
    ).rejects.toThrow('Cannot grade video without grading config');
  });

  it('fails before grading when the video cannot be resolved', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    mocks.resolveVideoBytes.mockRejectedValue(new Error('missing blob'));

    const result = await matchesVideoRubric(
      'rubric',
      { blobRef: {} as any },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'Failed to resolve managed video',
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('fails before grading when the encoded video and rubric exceed the request budget', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');

    const result = await matchesVideoRubric(
      'rubric'.repeat(4 * 1024 * 1024),
      { storageRef: { key: 'video/test.mp4' } },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('video-grading request budget'),
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('fails before grading when the video exceeds the inline limit', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    mocks.resolveVideoBytes.mockResolvedValue({
      buffer: Buffer.alloc(21 * 1024 * 1024),
      mimeType: 'video/mp4',
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/large.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('video-grading request budget'),
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('returns provider errors before parsing a grader response', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      error: 'grader unavailable for sk-secret',
      tokenUsage: { total: 2, prompt: 1, completion: 1 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'Video grading provider returned an error',
        metadata: { graderError: true },
        tokensUsed: expect.objectContaining({ total: 2 }),
      }),
    );
    expect(result.reason).not.toContain('sk-secret');
  });

  it('returns a default failure when the grader response has no output', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      tokenUsage: { total: 3, prompt: 2, completion: 1 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'No output from video grading provider',
        metadata: { graderError: true },
        tokensUsed: expect.objectContaining({ total: 3 }),
      }),
    );
  });

  it('returns a failure when the grader response is not parseable JSON', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: 'not json sk-secret',
      tokenUsage: { total: 4, prompt: 2, completion: 2 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'video-rubric requires one complete JSON object',
        metadata: { graderError: true },
        tokensUsed: expect.objectContaining({ total: 4 }),
      }),
    );
    expect(result.reason).not.toContain('sk-secret');
  });

  it.each([
    '{"pass":true,"score":1',
    '{pass: true, score: 1}',
    '{"pass":true,"score":1} trailing text',
    '{"pass":true,"score":1} {"pass":false,"score":0}',
  ])('rejects incomplete or non-JSON grader text: %s', async (output) => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({ output });
    const result = await matchesVideoRubric(
      'The video shows a cat',
      { storageRef: { key: 'video/fixture.mp4' } },
      { provider: mocks.gradingProvider },
    );
    expect(result).toMatchObject({ pass: false, score: 0, metadata: { graderError: true } });
  });

  it('accepts one complete fenced JSON response', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: '```json\n{"pass":true,"score":0.9}\n```',
    });
    const result = await matchesVideoRubric(
      'The video shows a cat',
      { storageRef: { key: 'video/fixture.mp4' } },
      { provider: mocks.gradingProvider },
    );
    expect(result).toMatchObject({ pass: true, score: 0.9 });
  });

  it('returns a malformed-response failure for array grader output', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: ['bad response sk-secret'],
      tokenUsage: { total: 5, prompt: 3, completion: 2 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'video-rubric requires one complete JSON object',
        metadata: { graderError: true },
        tokensUsed: expect.objectContaining({ total: 5 }),
      }),
    );
    expect(result.reason).not.toContain('sk-secret');
  });

  it('coerces object grader output and applies string thresholds', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: 'yes', score: '0.75', reason: 'Video matches rubric' },
      tokenUsage: { total: 6, prompt: 4, completion: 2 },
    });
    const stringThresholdAssertion = {
      type: 'video-rubric',
      threshold: '0.8',
    } as unknown as Assertion;

    const result = await matchesVideoRubric(
      { criteria: ['motion', 'composition'] },
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
      undefined,
      stringThresholdAssertion,
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.75,
        reason: 'Score 0.75 below threshold 0.8',
      }),
    );
  });

  it('fails closed when the grader omits pass or returns a nonnumeric score', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { score: 'not-a-number' },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('must include a boolean pass and a finite score'),
        metadata: { graderError: true },
      }),
    );
  });

  it('fails closed when the grader returns a score outside the documented range', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: true, score: 2 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('must include a boolean pass and a finite score'),
        metadata: { graderError: true },
      }),
    );
  });

  it('returns the generic failed fallback for invalid string thresholds', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: false, score: 0.2 },
    });
    const invalidThresholdAssertion = {
      type: 'video-rubric',
      threshold: 'not-a-number',
    } as unknown as Assertion;

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
      undefined,
      invalidThresholdAssertion,
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.2,
        reason: 'Video grading failed',
      }),
    );
  });

  it('does not blame the threshold when the grader fails above the minimum score', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: false, score: 0.9 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
      undefined,
      { type: 'video-rubric', threshold: 0.8 },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.9,
        reason: 'Video grading failed',
      }),
    );
  });

  it('returns the generic failed fallback when no threshold reason is available', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/rubric');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: false, score: 0.2 },
    });

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.2,
        reason: 'Video grading failed',
      }),
    );
  });
});
