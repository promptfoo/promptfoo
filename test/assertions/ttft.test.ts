import { describe, expect, it } from 'vitest';

import { handleTtft } from '../../src/assertions/ttft';

import type { AssertionParams } from '../../src/types/index';

describe('ttft assertion', () => {
  describe('passing cases', () => {
    it('should pass when TTFT is below threshold', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('TTFT assertion passed: 500ms <= 1000ms');
      expect(result.namedScores).toEqual({ ttft_ms: 500 });
    });

    it('should pass when TTFT equals threshold (boundary case)', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 500 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('TTFT assertion passed: 500ms <= 500ms');
    });

    it('should pass with zero threshold when TTFT is zero', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 0 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 0 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should pass with very large threshold', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 60000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 30000 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  describe('failing cases', () => {
    it('should fail when TTFT exceeds threshold', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 1500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Time to first token 1500ms exceeds threshold 1000ms');
      expect(result.namedScores).toEqual({ ttft_ms: 1500 });
    });

    it('should fail when TTFT slightly exceeds threshold', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 1001 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should fail with zero threshold when TTFT is positive', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 0 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 1 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('threshold validation', () => {
    it('should throw when threshold is missing', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft' },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is undefined', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: undefined },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is a string', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: '1000' as any },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is negative', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: -100 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is Infinity', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: Infinity },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is negative Infinity', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: -Infinity },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is NaN', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: NaN },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });

    it('should throw when threshold is null', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: null as any },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion must specify a non-negative number threshold in milliseconds',
      );
    });
  });

  describe('streaming metrics validation', () => {
    it('should throw when streaming metrics are missing', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {},
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
      );
    });

    it('should throw when streaming metrics are undefined', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: { streamingMetrics: undefined },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
      );
    });

    it('should throw when streaming metrics are null', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: { streamingMetrics: null as any },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
      );
    });

    it('should throw when providerResponse is missing', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: undefined,
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
      );
    });

    it('should throw when timeToFirstToken is missing from streaming metrics', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: {} as any,
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion could not measure time to first token. This may indicate an issue with the streaming response or network timing.',
      );
    });

    it('should throw when timeToFirstToken is undefined', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: undefined as any },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion could not measure time to first token. This may indicate an issue with the streaming response or network timing.',
      );
    });

    it('should throw when timeToFirstToken is a string', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: '500' as any },
        },
      };

      expect(() => handleTtft(params as AssertionParams)).toThrow(
        'TTFT assertion could not measure time to first token. This may indicate an issue with the streaming response or network timing.',
      );
    });
  });

  describe('result structure', () => {
    it('should include assertion in result', () => {
      const assertion = { type: 'ttft' as const, threshold: 1000 };
      const params: Partial<AssertionParams> = {
        assertion,
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.assertion).toBe(assertion);
    });

    it('should include namedScores with ttft_ms on pass', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.namedScores).toEqual({ ttft_ms: 500 });
    });

    it('should include namedScores with ttft_ms on fail', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 1500 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.namedScores).toEqual({ ttft_ms: 1500 });
    });

    it('should handle decimal TTFT values', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'ttft', threshold: 1000 },
        providerResponse: {
          streamingMetrics: { timeToFirstToken: 567.89 },
        },
      };

      const result = handleTtft(params as AssertionParams);
      expect(result.pass).toBe(true);
      expect(result.namedScores).toEqual({ ttft_ms: 567.89 });
    });
  });
});
