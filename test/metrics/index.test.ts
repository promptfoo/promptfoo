import { computeEvalMetrics } from '../../src/metrics';
import type { MetricableResult } from '../../src/metrics/types';
import type { ApiProvider, EvaluateStats } from '../../src/types';
import { TokenUsageTracker } from '../../src/util/tokenUsage';

// Mock TokenUsageTracker
jest.mock('../../src/util/tokenUsage', () => ({
  TokenUsageTracker: {
    getInstance: jest.fn(),
  },
}));

describe('computeEvalMetrics', () => {
  const mockTracker = {
    getProviderUsage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (TokenUsageTracker.getInstance as jest.Mock).mockReturnValue(mockTracker);
    mockTracker.getProviderUsage.mockReturnValue(null);
  });

  const createStats = (overrides?: Partial<EvaluateStats>): EvaluateStats => ({
    successes: 0,
    failures: 0,
    errors: 0,
    tokenUsage: {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
    },
    ...overrides,
  });

  const createProvider = (id: string): ApiProvider =>
    ({
      id: () => id,
    }) as ApiProvider;

  it('should compute all metrics for empty input', () => {
    const metrics = computeEvalMetrics({
      results: [],
      stats: createStats(),
      providers: [],
    });

    expect(metrics).toEqual({
      latency: { avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
      cache: { hits: 0, misses: 0, hitRate: null },
      errors: {
        total: 0,
        types: [],
        breakdown: {
          timeout: 0,
          rate_limit: 0,
          auth: 0,
          server_error: 0,
          network: 0,
          other: 0,
        },
      },
      providers: [],
      assertions: {
        total: 0,
        passed: 0,
        passRate: 0,
        modelGraded: 0,
        breakdown: [],
        tokenUsage: {
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          numRequests: 0,
          reasoningTokens: 0,
        },
      },
      models: { ids: [], isComparison: false, hasCustom: false },
    });
  });

  it('should compute comprehensive metrics for realistic input', () => {
    const results: MetricableResult[] = [
      {
        success: true,
        latencyMs: 100,
        provider: { id: 'openai:gpt-4' },
        response: { cached: false },
        gradingResult: {
          componentResults: [
            { pass: true, assertion: { type: 'equals' } },
            { pass: false, assertion: { type: 'contains' } },
          ],
        },
      },
      {
        success: true,
        latencyMs: 200,
        provider: { id: 'openai:gpt-4' },
        response: { cached: true },
        gradingResult: {
          componentResults: [{ pass: true, assertion: { type: 'equals' } }],
        },
      },
      {
        success: false,
        latencyMs: 50,
        provider: { id: 'openai:gpt-4' },
        error: 'Rate limit exceeded',
      },
    ];

    const stats = createStats({
      successes: 2,
      failures: 1,
      errors: 0,
      tokenUsage: {
        total: 1000,
        prompt: 800,
        completion: 200,
        cached: 100,
        numRequests: 3,
      },
    });

    const providers = [createProvider('openai:gpt-4')];

    const metrics = computeEvalMetrics({ results, stats, providers });

    // Verify all metric categories are present
    expect(metrics.latency).toBeDefined();
    expect(metrics.cache).toBeDefined();
    expect(metrics.errors).toBeDefined();
    expect(metrics.providers).toBeDefined();
    expect(metrics.assertions).toBeDefined();
    expect(metrics.models).toBeDefined();

    // Spot check some values
    expect(metrics.latency.avgMs).toBe(117); // (100+200+50)/3 rounded
    expect(metrics.cache.hits).toBe(1);
    expect(metrics.cache.misses).toBe(1);
    expect(metrics.errors.total).toBe(1);
    expect(metrics.errors.breakdown.rate_limit).toBe(1);
    expect(metrics.assertions.total).toBe(3);
    expect(metrics.assertions.passed).toBe(2);
    expect(metrics.models.ids).toEqual(['openai:gpt-4']);
    expect(metrics.models.isComparison).toBe(false);
  });

  it('should detect model comparison correctly', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100, provider: { id: 'openai:gpt-4' } },
      { success: true, latencyMs: 200, provider: { id: 'anthropic:claude-3' } },
    ];

    const providers = [createProvider('openai:gpt-4'), createProvider('anthropic:claude-3')];

    const metrics = computeEvalMetrics({
      results,
      stats: createStats(),
      providers,
    });

    expect(metrics.models.isComparison).toBe(true);
    expect(metrics.models.ids).toEqual(['anthropic:claude-3', 'openai:gpt-4']);
  });
});
