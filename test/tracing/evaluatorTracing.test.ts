import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  generateTraceId,
  generateSpanId,
  generateTraceparent,
  isOtlpReceiverStarted,
  generateTraceContextIfNeeded,
} from '../../src/tracing/evaluatorTracing';
import type { TestCase } from '../../src/types';

// Mock the logger
jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the trace store
jest.mock('../../src/tracing/store', () => ({
  getTraceStore: jest.fn(() => ({
    createTrace: jest.fn(),
  })),
}));

describe('evaluatorTracing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.PROMPTFOO_TRACING_ENABLED;
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
      process.env.PROMPTFOO_TRACING_ENABLED = 'true';
      const test: TestCase = {
        vars: { foo: 'bar' },
      };
      const result = await generateTraceContextIfNeeded(test, {}, 5, 10);

      expect(result).not.toBeNull();
      expect(result!.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
      expect(result!.evaluationId).toMatch(/^eval-/);
      expect(result!.testCaseId).toBe('5-10');
    });
  });

  describe('isOtlpReceiverStarted', () => {
    it('should return false initially', () => {
      expect(isOtlpReceiverStarted()).toBe(false);
    });
  });
});
