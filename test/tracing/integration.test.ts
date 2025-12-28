import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EvaluateTestSuite } from '../../src/types/index';

// Mock the trace store to avoid database dependency in tests
vi.mock('../../src/tracing/store', () => ({
  getTraceStore: vi.fn(() => ({
    createTrace: vi.fn().mockResolvedValue(undefined),
    addSpans: vi.fn().mockResolvedValue(undefined),
    getTracesByEvaluation: vi.fn().mockResolvedValue([]),
    getTrace: vi.fn().mockResolvedValue(null),
  })),
  TraceStore: vi.fn(),
}));

// Define the mock provider class
class MockTracedProviderInstance {
  id() {
    return 'mock-traced-provider';
  }

  async callApi(prompt: string, context: any) {
    if (context.traceparent) {
      return {
        output: `Traced response for: ${prompt}`,
        metadata: {
          traceparent: context.traceparent,
          evaluationId: context.evaluationId,
          testCaseId: context.testCaseId,
        },
      };
    }
    return {
      output: `Untraced response for: ${prompt}`,
    };
  }
}

const mockProvider = new MockTracedProviderInstance();

// Mock providers using vi.mock with async importActual
vi.mock('../../src/providers', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers')>('../../src/providers');
  return {
    ...actual,
    loadApiProvider: vi.fn(async (providerPath: string) => {
      if (providerPath === 'mock-traced-provider') {
        return mockProvider;
      }
      // Fall back to original for other providers
      return actual.loadApiProvider(providerPath);
    }),
    loadApiProviders: vi.fn(async (providers: any) => {
      if (Array.isArray(providers) && providers.includes('mock-traced-provider')) {
        return [mockProvider];
      }
      if (providers === 'mock-traced-provider') {
        return [mockProvider];
      }
      return [mockProvider]; // Default to mock for tests
    }),
  };
});

// Dynamic import after mocking - initialized in beforeAll
let evaluate: typeof import('../../src/index').evaluate;

describe('OpenTelemetry Tracing Integration', () => {
  beforeAll(async () => {
    const mod = await import('../../src/index');
    evaluate = mod.evaluate;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass trace context to providers when tracing is enabled', async () => {
    const config: Partial<EvaluateTestSuite> = {
      providers: ['mock-traced-provider'],
      prompts: ['Test prompt'],
      tests: [
        {
          vars: { topic: 'testing' },
        },
      ],
      tracing: {
        enabled: true,
        otlp: {
          http: {
            enabled: true,
            port: 4318,
            host: '127.0.0.1',
            acceptFormats: ['json'],
          },
        },
      },
    };

    // Run evaluation
    const results = await evaluate(config as EvaluateTestSuite, {
      cache: false,
      maxConcurrency: 1,
    });

    // Check that results contain trace context
    expect(results.results).toBeDefined();
    expect(results.results.length).toBeGreaterThan(0);

    const firstResult = results.results[0];
    expect(firstResult.response).toBeDefined();
    expect(firstResult.response?.metadata).toBeDefined();
    expect(firstResult.response?.metadata?.traceparent).toBeDefined();
    expect(firstResult.response?.metadata?.traceparent).toMatch(
      /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/,
    );
    expect(firstResult.response?.metadata?.evaluationId).toBeDefined();
    expect(firstResult.response?.metadata?.testCaseId).toBeDefined();
  });

  it('should not pass trace context when tracing is disabled', async () => {
    const config: Partial<EvaluateTestSuite> = {
      providers: ['mock-traced-provider'],
      prompts: ['Test prompt'],
      tests: [
        {
          vars: { topic: 'testing' },
        },
      ],
      tracing: {
        enabled: false,
      },
    };

    // Run evaluation
    const results = await evaluate(config as EvaluateTestSuite, {
      cache: false,
      maxConcurrency: 1,
    });

    // Check that results do not contain trace context
    expect(results.results).toBeDefined();
    expect(results.results.length).toBeGreaterThan(0);

    const firstResult = results.results[0];
    expect(firstResult.response).toBeDefined();
    expect(firstResult.response?.metadata?.traceparent).toBeUndefined();
    expect(firstResult.response?.output).toContain('Untraced response');
  });

  it('should generate unique trace IDs for each test case', async () => {
    const config: Partial<EvaluateTestSuite> = {
      providers: ['mock-traced-provider'],
      prompts: ['Prompt 1', 'Prompt 2'],
      tests: [{ vars: { topic: 'test1' } }, { vars: { topic: 'test2' } }],
      tracing: {
        enabled: true,
      },
    };

    // Run evaluation
    const results = await evaluate(config as EvaluateTestSuite, {
      cache: false,
      maxConcurrency: 1,
    });

    // Collect all trace IDs
    const traceIds = results.results
      .map((r: any) => r.response?.metadata?.traceparent)
      .filter(Boolean)
      .map((tp: string) => tp!.split('-')[1]); // Extract trace ID from traceparent

    // All trace IDs should be unique
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(traceIds.length);
  });

  it('should respect environment variable for enabling tracing', async () => {
    // Set environment variable
    process.env.PROMPTFOO_TRACING_ENABLED = 'true';

    const config: Partial<EvaluateTestSuite> = {
      providers: ['mock-traced-provider'],
      prompts: ['Test prompt'],
      tests: [{ vars: { topic: 'testing' } }],
      // No tracing config in YAML
    };

    // Run evaluation
    const results = await evaluate(config as EvaluateTestSuite, {
      cache: false,
      maxConcurrency: 1,
    });

    // Should have trace context from environment variable
    expect(results.results[0].response).toBeDefined();
    expect(results.results[0].response?.metadata?.traceparent).toBeDefined();

    // Clean up
    delete process.env.PROMPTFOO_TRACING_ENABLED;
  });
});
