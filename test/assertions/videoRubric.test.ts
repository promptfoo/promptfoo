import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleVideoRubric } from '../../src/assertions/videoRubric';

import type { AssertionParams, GradingResult } from '../../src/types/index';

// Mock the matcher
vi.mock('../../src/matchers', () => ({
  matchesVideoRubric: vi.fn(),
}));

import { matchesVideoRubric } from '../../src/matchers';

describe('handleVideoRubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail when no video is in the response', async () => {
    const params: AssertionParams = {
      assertion: { type: 'video-rubric', value: 'test rubric' },
      renderedValue: 'test rubric',
      test: {
        vars: {},
        options: {},
      },
      providerResponse: {
        output: 'test output',
      },
      providerCallContext: {} as any,
    };

    const result = await handleVideoRubric(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('No video found');
  });

  it('should call matchesVideoRubric when video is present', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1.0,
      reason: 'Video meets all criteria',
    };
    vi.mocked(matchesVideoRubric).mockResolvedValue(mockResult);

    const params: AssertionParams = {
      assertion: { type: 'video-rubric', value: 'test rubric' },
      renderedValue: 'test rubric',
      test: {
        vars: {},
        options: {},
      },
      providerResponse: {
        output: 'test output',
        video: {
          blobRef: { hash: 'abc123', mimeType: 'video/mp4' },
          format: 'mp4',
        },
      },
      providerCallContext: {} as any,
    };

    const result = await handleVideoRubric(params);

    expect(matchesVideoRubric).toHaveBeenCalledWith(
      'test rubric',
      expect.objectContaining({ blobRef: { hash: 'abc123', mimeType: 'video/mp4' } }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result).toEqual(mockResult);
  });

  it('should handle object rubric values', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 0.8,
      reason: 'Good video quality',
    };
    vi.mocked(matchesVideoRubric).mockResolvedValue(mockResult);

    const rubricObject = {
      criteria: ['scene content', 'visual quality', 'motion'],
      minScore: 0.7,
    };

    const params: AssertionParams = {
      assertion: { type: 'video-rubric', value: rubricObject },
      renderedValue: rubricObject,
      test: {
        vars: {},
        options: {},
      },
      providerResponse: {
        output: 'test output',
        video: {
          url: 'https://example.com/video.mp4',
          format: 'mp4',
        },
      },
      providerCallContext: {} as any,
    };

    const result = await handleVideoRubric(params);

    expect(matchesVideoRubric).toHaveBeenCalledWith(
      rubricObject,
      expect.objectContaining({ url: 'https://example.com/video.mp4' }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.8);
  });

  it('should use rubricPrompt from test options', async () => {
    const mockResult: GradingResult = {
      pass: true,
      score: 1.0,
      reason: 'Excellent',
    };
    vi.mocked(matchesVideoRubric).mockResolvedValue(mockResult);

    const params: AssertionParams = {
      assertion: { type: 'video-rubric' },
      renderedValue: undefined,
      test: {
        vars: {},
        options: {
          rubricPrompt: 'Custom rubric from options',
        },
      },
      providerResponse: {
        output: 'test output',
        video: {
          blobRef: { hash: 'xyz789', mimeType: 'video/mp4' },
        },
      },
      providerCallContext: {} as any,
    };

    const result = await handleVideoRubric(params);

    expect(matchesVideoRubric).toHaveBeenCalledWith(
      '',
      expect.any(Object),
      expect.objectContaining({ rubricPrompt: 'Custom rubric from options' }),
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.pass).toBe(true);
  });
});
