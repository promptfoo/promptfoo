import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleVideoRubric } from '../../src/assertions/videoRubric';

import type { AssertionParams, GradingResult } from '../../src/types/index';

// Mock the matcher
vi.mock('../../src/matchers', () => ({
  matchesVideoRubric: vi.fn(),
}));

import { matchesVideoRubric } from '../../src/matchers';

// Helper to create minimal valid AssertionParams
function createParams(overrides: Partial<AssertionParams> = {}): AssertionParams {
  const test = overrides.test ?? { vars: {}, options: {} };
  const providerResponse = overrides.providerResponse ?? { output: 'test output' };
  return {
    assertion: { type: 'video-rubric', value: 'test rubric' },
    baseType: 'video-rubric',
    renderedValue: 'test rubric',
    assertionValueContext: {
      prompt: undefined,
      vars: {},
      test,
      logProbs: undefined,
      provider: undefined,
      providerResponse,
    },
    inverse: false,
    output: 'test output',
    outputString: 'test output',
    test,
    providerResponse,
    providerCallContext: {} as any,
    ...overrides,
  };
}

// Helper to create valid BlobRef
function createBlobRef(overrides: Partial<{ uri: string; hash: string; mimeType: string; sizeBytes: number; provider: string }> = {}) {
  return {
    uri: 'blob://test/video.mp4',
    hash: 'abc123',
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    provider: 'test',
    ...overrides,
  };
}

describe('handleVideoRubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail when no video is in the response', async () => {
    const params = createParams();

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

    const blobRef = createBlobRef();
    const params = createParams({
      providerResponse: {
        output: 'test output',
        video: {
          blobRef,
          format: 'mp4',
        },
      },
    });

    const result = await handleVideoRubric(params);

    expect(matchesVideoRubric).toHaveBeenCalledWith(
      'test rubric',
      expect.objectContaining({ blobRef }),
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

    const params = createParams({
      assertion: { type: 'video-rubric', value: rubricObject },
      renderedValue: rubricObject,
      providerResponse: {
        output: 'test output',
        video: {
          url: 'https://example.com/video.mp4',
          format: 'mp4',
        },
      },
    });

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

    const blobRef = createBlobRef({ hash: 'xyz789' });
    const params = createParams({
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
          blobRef,
        },
      },
    });

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
