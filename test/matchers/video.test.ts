import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

const mocks = vi.hoisted(() => {
  const gradingProvider: ApiProvider = {
    id: () => 'test:video-grader',
    callApi: vi.fn(),
  };

  return {
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
    const multimodalPrompt = JSON.parse(vi.mocked(mocks.gradingProvider.callApi).mock.calls[0][0]);
    expect(multimodalPrompt[0].parts[0].inline_data).toEqual({
      mime_type: 'video/mp4',
      data: 'ZmFrZSB2aWRlbyBieXRlcw==',
    });
    expect(multimodalPrompt[0].parts[1].text).toContain('The video shows a cat');
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
        reason: expect.stringContaining('inline limit'),
      }),
    );
    expect(mocks.gradingProvider.callApi).not.toHaveBeenCalled();
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
});
