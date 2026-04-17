import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateSpanId,
  generateTraceContextIfNeeded,
  generateTraceId,
  generateTraceparent,
  getLocalOtlpHttpEndpoint,
  isOtlpReceiverStarted,
  isTracingEnabled,
  resetTracingState,
  startOtlpReceiverIfNeeded,
} from '../../src/tracing/evaluatorTracing';

import type { TestCase, TestSuite } from '../../src/types/index';

// Mock the logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const otlpReceiverMocks = vi.hoisted(() => ({
  startOTLPReceiver: vi.fn().mockResolvedValue(undefined),
  stopOTLPReceiver: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/tracing/otlpReceiver', () => otlpReceiverMocks);

// Mock the trace store
vi.mock('../../src/tracing/store', () => ({
  getTraceStore: vi.fn(() => ({
    createTrace: vi.fn(),
  })),
}));

describe('evaluatorTracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTracingState();
    otlpReceiverMocks.startOTLPReceiver.mockResolvedValue(undefined);
    otlpReceiverMocks.stopOTLPReceiver.mockResolvedValue(undefined);
    // Reset environment variables
    delete process.env.PROMPTFOO_OTEL_ENABLED;
  });

  describe('generateTraceId', () => {
    it('should generate a 32-character hex string', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(traceId).toHaveLength(32);
    });

    it('should generate unique IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateSpanId', () => {
    it('should generate a 16-character hex string', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[a-f0-9]{16}$/);
      expect(spanId).toHaveLength(16);
    });

    it('should generate unique IDs', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateTraceparent', () => {
    it('should generate valid W3C Trace Context format with sampled flag', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const traceparent = generateTraceparent(traceId, spanId, true);
      expect(traceparent).toBe(`00-${traceId}-${spanId}-01`);
    });

    it('should generate valid W3C Trace Context format without sampled flag', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const traceparent = generateTraceparent(traceId, spanId, false);
      expect(traceparent).toBe(`00-${traceId}-${spanId}-00`);
    });

    it('should default to sampled=true', () => {
      const traceId = 'a'.repeat(32);
      const spanId = 'b'.repeat(16);
      const traceparent = generateTraceparent(traceId, spanId);
      expect(traceparent).toBe(`00-${traceId}-${spanId}-01`);
    });
  });

  describe('generateTraceContextIfNeeded', () => {
    it('should return null when tracing is not enabled', async () => {
      const test: TestCase = {
        vars: { foo: 'bar' },
      };
      const result = await generateTraceContextIfNeeded(test, {}, 0, 0);
      expect(result).toBeNull();
    });

    it('should generate trace context when tracing is enabled via metadata', async () => {
      const test: TestCase = {
        vars: { foo: 'bar' },
        metadata: {
          tracingEnabled: true,
          evaluationId: 'eval-123',
          testCaseId: 'test-456',
        },
      };
      const result = await generateTraceContextIfNeeded(test, {}, 0, 0);

      expect(result).not.toBeNull();
      expect(result!.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(result!.evaluationId).toBe('eval-123');
      expect(result!.testCaseId).toBe('test-456');
    });

    it('should generate trace context when tracing is enabled via environment', async () => {
      process.env.PROMPTFOO_OTEL_ENABLED = 'true';
      const test: TestCase = {
        vars: { foo: 'bar' },
      };
      const result = await generateTraceContextIfNeeded(test, {}, 5, 10);

      expect(result).not.toBeNull();
      expect(result!.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(result!.evaluationId).toMatch(/^eval-/);
      expect(result!.testCaseId).toBe('5-10');
    });

    it('should generate trace context when tracing is enabled via YAML config', async () => {
      const test: TestCase = {
        vars: { foo: 'bar' },
      };
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: {
          enabled: true,
        },
      } as unknown as TestSuite;

      const result = await generateTraceContextIfNeeded(test, {}, 3, 7, testSuite);

      expect(result).not.toBeNull();
      expect(result!.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(result!.evaluationId).toMatch(/^eval-/);
      expect(result!.testCaseId).toBe('3-7');
    });
  });

  describe('isTracingEnabled', () => {
    it('should return false when no tracing is configured', () => {
      const test: TestCase = { vars: {} };
      expect(isTracingEnabled(test)).toBe(false);
    });

    it('should return true when test metadata has tracingEnabled', () => {
      const test: TestCase = {
        vars: {},
        metadata: { tracingEnabled: true },
      };
      expect(isTracingEnabled(test)).toBe(true);
    });

    it('should return true when PROMPTFOO_OTEL_ENABLED is set', () => {
      process.env.PROMPTFOO_OTEL_ENABLED = 'true';
      const test: TestCase = { vars: {} };
      expect(isTracingEnabled(test)).toBe(true);
    });

    it('should return true when testSuite.tracing.enabled is true', () => {
      const test: TestCase = { vars: {} };
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: { enabled: true },
      } as unknown as TestSuite;
      expect(isTracingEnabled(test, testSuite)).toBe(true);
    });

    it('should return false when testSuite.tracing.enabled is false', () => {
      const test: TestCase = { vars: {} };
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: { enabled: false },
      } as unknown as TestSuite;
      expect(isTracingEnabled(test, testSuite)).toBe(false);
    });

    it('should return true when any source enables tracing', () => {
      const test: TestCase = {
        vars: {},
        metadata: { tracingEnabled: false },
      };
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: { enabled: true },
      } as unknown as TestSuite;
      // testSuite enables tracing even though metadata doesn't
      expect(isTracingEnabled(test, testSuite)).toBe(true);
    });
  });

  describe('getLocalOtlpHttpEndpoint', () => {
    it('should return the default local HTTP receiver endpoint', () => {
      const testSuite = {
        providers: [],
        prompts: [],
      } as unknown as TestSuite;

      expect(getLocalOtlpHttpEndpoint(testSuite)).toBe('http://127.0.0.1:4318');
    });

    it('should convert wildcard bind hosts into a connectable loopback endpoint', () => {
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: {
          enabled: true,
          otlp: {
            http: {
              enabled: true,
              port: 44329,
              host: '0.0.0.0',
              acceptFormats: ['json'],
            },
          },
        },
      } as unknown as TestSuite;

      expect(getLocalOtlpHttpEndpoint(testSuite)).toBe('http://127.0.0.1:44329');
    });

    it('should bracket IPv6 receiver hosts for endpoint URLs', () => {
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: {
          enabled: true,
          otlp: {
            http: {
              enabled: true,
              port: 44330,
              host: '::1',
              acceptFormats: ['json'],
            },
          },
        },
      } as unknown as TestSuite;

      expect(getLocalOtlpHttpEndpoint(testSuite)).toBe('http://[::1]:44330');
    });

    it('should convert IPv6 wildcard bind hosts into IPv6 loopback endpoints', () => {
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: {
          enabled: true,
          otlp: {
            http: {
              enabled: true,
              port: 44331,
              host: '::',
              acceptFormats: ['json'],
            },
          },
        },
      } as unknown as TestSuite;

      expect(getLocalOtlpHttpEndpoint(testSuite)).toBe('http://[::1]:44331');
    });

    it('should return undefined when the local HTTP receiver is disabled', () => {
      const testSuite = {
        providers: [],
        prompts: [],
        tracing: {
          enabled: true,
          otlp: {
            http: {
              enabled: false,
              port: 4318,
              host: '127.0.0.1',
              acceptFormats: ['json'],
            },
          },
        },
      } as unknown as TestSuite;

      expect(getLocalOtlpHttpEndpoint(testSuite)).toBeUndefined();
    });
  });

  describe('isOtlpReceiverStarted', () => {
    it('should return false initially', () => {
      expect(isOtlpReceiverStarted()).toBe(false);
    });

    it('should start the OTLP receiver when a test enables tracing via metadata', async () => {
      const testSuite = {
        providers: [],
        prompts: [],
        tests: [
          {
            vars: {},
            metadata: { tracingEnabled: true },
          },
        ],
        tracing: {
          otlp: {
            http: {
              enabled: true,
              port: 44329,
              host: '127.0.0.1',
              acceptFormats: ['json'],
            },
          },
        },
      } as unknown as TestSuite;

      await startOtlpReceiverIfNeeded(testSuite);

      expect(otlpReceiverMocks.startOTLPReceiver).toHaveBeenCalledWith(44329, '127.0.0.1');
      expect(isOtlpReceiverStarted()).toBe(true);
    });
  });
});
