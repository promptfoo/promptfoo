import { describe, expect, it } from 'vitest';
import { createTraceProvider, isExternalTraceProvider } from '../../../src/tracing/providers';
import { TempoProvider } from '../../../src/tracing/providers/tempo';

describe('tracing/providers', () => {
  describe('createTraceProvider', () => {
    it('should create TempoProvider for type "tempo"', () => {
      const provider = createTraceProvider({
        type: 'tempo',
        endpoint: 'http://tempo:3200',
      });

      expect(provider).toBeInstanceOf(TempoProvider);
      expect(provider.id).toBe('tempo');
    });

    it('should throw for type "local"', () => {
      expect(() =>
        createTraceProvider({
          type: 'local',
        }),
      ).toThrow('Local provider type should use TraceStore directly');
    });

    it('should throw for unknown provider type', () => {
      expect(() =>
        createTraceProvider({
          type: 'unknown' as any,
          endpoint: 'http://unknown:3200',
        }),
      ).toThrow('Unknown trace provider type: unknown');
    });
  });

  describe('isExternalTraceProvider', () => {
    it('should return false for undefined config', () => {
      expect(isExternalTraceProvider(undefined)).toBe(false);
    });

    it('should return false for local type', () => {
      expect(
        isExternalTraceProvider({
          type: 'local',
          endpoint: 'http://localhost:3200',
        }),
      ).toBe(false);
    });

    it('should return false when endpoint is missing', () => {
      expect(
        isExternalTraceProvider({
          type: 'tempo',
        }),
      ).toBe(false);
    });

    it('should return true for tempo with endpoint', () => {
      expect(
        isExternalTraceProvider({
          type: 'tempo',
          endpoint: 'http://tempo:3200',
        }),
      ).toBe(true);
    });

    it('should return true for jaeger with endpoint', () => {
      expect(
        isExternalTraceProvider({
          type: 'jaeger',
          endpoint: 'http://jaeger:16686',
        }),
      ).toBe(true);
    });
  });
});
