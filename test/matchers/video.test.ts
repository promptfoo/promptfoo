import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    gradingProvider,
    isWithinInlineLimit: vi.fn(),
    resolveVideoBytes: vi.fn(),
    videoToBase64: vi.fn(),
  };
});

vi.mock('../../src/util/video', () => ({
  VIDEO_INLINE_LIMIT_BYTES: 20 * 1024 * 1024,
  isWithinInlineLimit: mocks.isWithinInlineLimit,
  resolveVideoBytes: mocks.resolveVideoBytes,
  videoToBase64: mocks.videoToBase64,
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: mocks.getDefaultProviders,
}));

describe('matchesVideoRubric', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveVideoBytes.mockResolvedValue({
      buffer: Buffer.from('fake video bytes'),
      mimeType: 'video/mp4',
    });
    mocks.isWithinInlineLimit.mockReturnValue(true);
    mocks.videoToBase64.mockReturnValue('ZmFrZSB2aWRlbyBieXRlcw==');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.9, reason: 'Video matches rubric' }),
      tokenUsage: { total: 8, prompt: 5, completion: 3 },
    } satisfies ProviderResponse);
    vi.mocked(mocks.defaultVideoGradingProvider.callApi).mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 0.9, reason: 'Default video grade' }),
      tokenUsage: { total: 8, prompt: 5, completion: 3 },
    } satisfies ProviderResponse);
    mocks.getDefaultProviders.mockResolvedValue({
      videoGradingProvider: mocks.defaultVideoGradingProvider,
    });
  });

  it('sends inline video content to the grading provider and parses JSON results', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');

    const result = await matchesVideoRubric(
      'The video shows a cat',
      { url: 'https://example.com/video.mp4' },
      { provider: mocks.gradingProvider },
      { animal: 'cat' },
      { type: 'video-rubric', value: 'The video shows a cat', threshold: 0.8 },
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

    expect(mocks.gradingProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mocks.getDefaultProviders).not.toHaveBeenCalled();
    const multimodalPrompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(multimodalPrompt[0].parts[0].inline_data).toEqual({
      mime_type: 'video/mp4',
      data: 'ZmFrZSB2aWRlbyBieXRlcw==',
    });
    expect(multimodalPrompt[0].parts[1].text).toContain('The video shows a cat');
  });

  it('uses the configured default video grading provider when no assertion provider is set', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');

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
    expect(mocks.getDefaultProviders).toHaveBeenCalledTimes(1);
    expect(mocks.defaultVideoGradingProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('renders custom rubric prompts with vars', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');

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
    expect(multimodalPrompt[0].parts[1].text).toBe(
      'Judge this: Show {{ animal }} clearly / animal=owl',
    );
  });

  it('requires an explicit grading config', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');

    await expect(
      matchesVideoRubric('rubric', { url: 'https://example.com/video.mp4' }),
    ).rejects.toThrow('Cannot grade video without grading config');
  });

  it('fails before grading when the video cannot be resolved', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
        reason: 'Failed to resolve video: missing blob',
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('fails before grading when the encoded video and rubric exceed the request budget', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    mocks.videoToBase64.mockReturnValue('x'.repeat(20 * 1024 * 1024));

    const result = await matchesVideoRubric(
      'rubric',
      { storageRef: { key: 'video/test.mp4' } },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('inline request limit'),
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('fails before grading when the video exceeds the inline limit', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    mocks.resolveVideoBytes.mockResolvedValue({
      buffer: Buffer.alloc(21 * 1024 * 1024),
      mimeType: 'video/mp4',
    });
    mocks.isWithinInlineLimit.mockReturnValue(false);

    const result = await matchesVideoRubric(
      'rubric',
      { url: 'https://example.com/large.mp4' },
      { provider: mocks.gradingProvider },
    );

    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: expect.stringContaining('inline request limit'),
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
  });

  it('returns provider errors before parsing a grader response', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      error: 'grader unavailable',
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
        reason: 'grader unavailable',
        tokensUsed: expect.objectContaining({ total: 2 }),
      }),
    );
  });

  it('returns a default failure when the grader response has no output', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
        tokensUsed: expect.objectContaining({ total: 3 }),
      }),
    );
  });

  it('returns a failure when the grader response is not parseable JSON', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: 'not json',
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
        reason: 'Could not extract JSON from video-rubric response: not json',
        tokensUsed: expect.objectContaining({ total: 4 }),
      }),
    );
  });

  it('returns a malformed-response failure for array grader output', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: ['bad response'],
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
        reason: 'video-rubric produced malformed response. Output: ["bad response"]',
        tokensUsed: expect.objectContaining({ total: 5 }),
      }),
    );
  });

  it('coerces object grader output and applies string thresholds', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
    vi.mocked(mocks.gradingProvider.callApi).mockResolvedValue({
      output: { pass: 'yes', score: '0.75' },
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
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
      }),
    );
  });

  it('fails closed when the grader returns a score outside the documented range', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
      }),
    );
  });

  it('returns the generic failed fallback for invalid string thresholds', async () => {
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
    const { matchesVideoRubric } = await import('../../src/matchers/video');
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
