import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleContentSafety } from '../../src/assertions/contentSafety';

import type { Assertion, AssertionParams, TestCase } from '../../src/types/index';

// Create mock functions outside to reference them
const mockAnalyzeText = vi.fn();
const mockAnalyzeImage = vi.fn();

// Mock the entire module with a class-like mock
vi.mock('../../src/providers/azure/moderation', () => {
  return {
    AzureModerationProvider: class MockAzureModerationProvider {
      analyzeText = mockAnalyzeText;
      analyzeImage = mockAnalyzeImage;
    },
  };
});

describe('handleContentSafety', () => {
  const mockTest: TestCase = {
    description: 'Test case',
    vars: {},
    assert: [],
    options: {},
  };

  const mockAssertion: Assertion = {
    type: 'content-safety',
    config: {
      endpoint: 'https://test.cognitiveservices.azure.com',
    },
  };

  const baseParams: AssertionParams = {
    assertion: mockAssertion,
    test: mockTest,
    outputString: 'test output',
    prompt: 'test prompt',
    baseType: 'content-safety',
    inverse: false,
    output: 'test output',
    providerResponse: { output: 'test output' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return error when endpoint is not configured', async () => {
    const params = {
      ...baseParams,
      assertion: { type: 'content-safety' as const },
    };

    // Mock env to ensure no endpoint
    const originalEnv = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
    delete process.env.AZURE_CONTENT_SAFETY_ENDPOINT;

    const result = await handleContentSafety(params);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('endpoint is not configured');

    // Restore env
    if (originalEnv) {
      process.env.AZURE_CONTENT_SAFETY_ENDPOINT = originalEnv;
    }
  });

  it('should pass when content is safe', async () => {
    mockAnalyzeText.mockResolvedValue({
      flags: [
        {
          code: 'hate',
          description: 'Hate (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
        {
          code: 'sexual',
          description: 'Sexual (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
        {
          code: 'selfharm',
          description: 'SelfHarm (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
        {
          code: 'violence',
          description: 'Violence (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
      ],
    });

    const result = await handleContentSafety(baseParams);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1); // 1 - maxScore(0) = 1
    expect(result.reason).toContain('passed safety check');
    expect(result.namedScores).toEqual({
      'content-safety/hate': 0,
      'content-safety/sexual': 0,
      'content-safety/selfharm': 0,
      'content-safety/violence': 0,
    });
  });

  it('should fail when content exceeds threshold', async () => {
    mockAnalyzeText.mockResolvedValue({
      flags: [
        {
          code: 'hate',
          description: 'Content flagged for Hate',
          confidence: 0.7,
          metadata: { azure_severity: 5, max_severity: 7 },
        },
        {
          code: 'sexual',
          description: 'Sexual (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
      ],
    });

    const result = await handleContentSafety(baseParams);

    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(0.3); // 1 - 0.7 = 0.3
    expect(result.reason).toContain('flagged for hate');
    expect(result.namedScores!['content-safety/hate']).toBe(0.7);
    expect(result.metadata!.maxCategory).toBe('hate');
    expect(result.metadata!.maxScore).toBe(0.7);
  });

  it('should use custom threshold from config', async () => {
    mockAnalyzeText.mockResolvedValue({
      flags: [
        {
          code: 'hate',
          description: 'Content flagged for Hate',
          confidence: 0.3,
          metadata: { azure_severity: 2, max_severity: 7 },
        },
      ],
    });

    // With default threshold (0.5), this should pass
    const result1 = await handleContentSafety(baseParams);
    expect(result1.pass).toBe(true);

    // With custom threshold (0.2), this should fail
    const result2 = await handleContentSafety({
      ...baseParams,
      assertion: {
        type: 'content-safety',
        config: {
          endpoint: 'https://test.cognitiveservices.azure.com',
          threshold: 0.2,
        },
      },
    });
    expect(result2.pass).toBe(false);
  });

  it('should fail when blocklist is matched', async () => {
    mockAnalyzeText.mockResolvedValue({
      flags: [
        {
          code: 'hate',
          description: 'Hate (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 7 },
        },
        {
          code: 'blocklist:custom-list',
          description: 'Content matched blocklist item: bad word',
          confidence: 1.0,
          metadata: { blocklist_item_id: '123', blocklist_item_text: 'bad word' },
        },
      ],
    });

    const result = await handleContentSafety(baseParams);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain('blocklist');
    expect(result.metadata!.blocklistMatches).toBeDefined();
  });

  it('should use analyzeImage for image content type', async () => {
    mockAnalyzeImage.mockResolvedValue({
      flags: [
        {
          code: 'violence',
          description: 'Violence (not flagged)',
          confidence: 0,
          metadata: { azure_severity: 0, max_severity: 3 },
        },
      ],
    });

    const result = await handleContentSafety({
      ...baseParams,
      assertion: {
        type: 'content-safety',
        config: {
          endpoint: 'https://test.cognitiveservices.azure.com',
          contentType: 'image',
        },
      },
    });

    expect(mockAnalyzeImage).toHaveBeenCalledWith('test output');
    expect(result.pass).toBe(true);
    expect(result.metadata!.contentType).toBe('image');
  });

  it('should handle API errors gracefully', async () => {
    mockAnalyzeText.mockResolvedValue({
      error: 'API rate limit exceeded',
      flags: [],
    });

    const result = await handleContentSafety(baseParams);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('API error');
  });

  it('should include metadata with raw severity values', async () => {
    mockAnalyzeText.mockResolvedValue({
      flags: [
        {
          code: 'hate',
          description: 'Content flagged for Hate',
          confidence: 0.6,
          metadata: { azure_severity: 4, max_severity: 7 },
        },
        {
          code: 'violence',
          description: 'Violence (not flagged)',
          confidence: 0.1,
          metadata: { azure_severity: 1, max_severity: 7 },
        },
      ],
    });

    const result = await handleContentSafety(baseParams);

    expect(result.metadata).toBeDefined();
    expect(result.metadata!.categories).toEqual({
      hate: 0.6,
      violence: 0.1,
    });
    expect(result.metadata!.raw_hate).toEqual({ azure_severity: 4, max_severity: 7 });
    expect(result.metadata!.raw_violence).toEqual({ azure_severity: 1, max_severity: 7 });
  });
});
