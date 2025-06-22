import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { evaluate } from '../../src/index';
import type { TestSuite, UnifiedConfig } from '../../src/types';

// Mock provider that uses tracing
const mockTracedProvider = `
const { trace, context } = require('@opentelemetry/api');

module.exports = {
  id: () => 'mock-traced-provider',
  
  async callApi(prompt, context) {
    // Check for trace context
    if (context.traceparent) {
      return {
        output: \`Traced response for: \${prompt}\`,
        metadata: {
          traceparent: context.traceparent,
          evaluationId: context.evaluationId,
          testCaseId: context.testCaseId,
        }
      };
    }
    
    return {
      output: \`Untraced response for: \${prompt}\`,
    };
  }
};
`;

describe('OpenTelemetry Tracing Integration', () => {
  let mockProviderPath: string;
  
  beforeEach(() => {
    // Mock file system for provider
    jest.mock('fs', () => ({
      ...jest.requireActual('fs'),
      readFileSync: jest.fn((path) => {
        if (path.endsWith('mock-traced-provider.js')) {
          return mockTracedProvider;
        }
        return jest.requireActual('fs').readFileSync(path);
      }),
      existsSync: jest.fn((path) => {
        if (path.endsWith('mock-traced-provider.js')) {
          return true;
        }
        return jest.requireActual('fs').existsSync(path);
      }),
    }));
    
    mockProviderPath = './mock-traced-provider.js';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should pass trace context to providers when tracing is enabled', async () => {
    const config: Partial<UnifiedConfig> = {
      providers: [`file://${mockProviderPath}`],
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
            acceptFormats: ['json'],
          },
        },
      },
    };

    // Run evaluation
    const results = await evaluate(config as UnifiedConfig, {
      cache: false,
      maxConcurrency: 1,
    });

    // Check that results contain trace context
    expect(results.results).toBeDefined();
    expect(results.results.length).toBeGreaterThan(0);
    
    const firstResult = results.results[0];
    expect(firstResult.response.metadata).toBeDefined();
    expect(firstResult.response.metadata.traceparent).toBeDefined();
    expect(firstResult.response.metadata.traceparent).toMatch(
      /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/
    );
    expect(firstResult.response.metadata.evaluationId).toBeDefined();
    expect(firstResult.response.metadata.testCaseId).toBeDefined();
  });

  it('should not pass trace context when tracing is disabled', async () => {
    const config: Partial<UnifiedConfig> = {
      providers: [`file://${mockProviderPath}`],
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
    const results = await evaluate(config as UnifiedConfig, {
      cache: false,
      maxConcurrency: 1,
    });

    // Check that results do not contain trace context
    expect(results.results).toBeDefined();
    expect(results.results.length).toBeGreaterThan(0);
    
    const firstResult = results.results[0];
    expect(firstResult.response.metadata?.traceparent).toBeUndefined();
    expect(firstResult.response.output).toContain('Untraced response');
  });

  it('should generate unique trace IDs for each test case', async () => {
    const config: Partial<UnifiedConfig> = {
      providers: [`file://${mockProviderPath}`],
      prompts: ['Prompt 1', 'Prompt 2'],
      tests: [
        { vars: { topic: 'test1' } },
        { vars: { topic: 'test2' } },
      ],
      tracing: {
        enabled: true,
      },
    };

    // Run evaluation
    const results = await evaluate(config as UnifiedConfig, {
      cache: false,
      maxConcurrency: 1,
    });

    // Collect all trace IDs
    const traceIds = results.results
      .map(r => r.response.metadata?.traceparent)
      .filter(Boolean)
      .map(tp => tp.split('-')[1]); // Extract trace ID from traceparent

    // All trace IDs should be unique
    const uniqueTraceIds = new Set(traceIds);
    expect(uniqueTraceIds.size).toBe(traceIds.length);
  });

  it('should respect environment variable for enabling tracing', async () => {
    // Set environment variable
    process.env.PROMPTFOO_TRACING_ENABLED = 'true';

    const config: Partial<UnifiedConfig> = {
      providers: [`file://${mockProviderPath}`],
      prompts: ['Test prompt'],
      tests: [
        { vars: { topic: 'testing' } },
      ],
      // No tracing config in YAML
    };

    // Run evaluation
    const results = await evaluate(config as UnifiedConfig, {
      cache: false,
      maxConcurrency: 1,
    });

    // Should have trace context from environment variable
    expect(results.results[0].response.metadata?.traceparent).toBeDefined();

    // Clean up
    delete process.env.PROMPTFOO_TRACING_ENABLED;
  });
});