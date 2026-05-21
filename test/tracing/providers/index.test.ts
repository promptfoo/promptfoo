import { describe, expect, it } from 'vitest';
import { createTraceProvider, isExternalTraceProvider } from '../../../src/tracing/providers';
import { TempoProvider } from '../../../src/tracing/providers/tempo';

describe('tracing/providers', () => {
  describe('createTraceProvider', () => {
    it('should create TempoProvider for id "tempo"', () => {
      const provider = createTraceProvider({
        id: 'tempo',
        endpoint: 'http://tempo:3200',
      });

      expect(provider).toBeInstanceOf(TempoProvider);
      expect(provider.id).toBe('tempo');
    });

    it('should throw for id "local"', () => {
      expect(() =>
        createTraceProvider({
          id: 'local',
        }),
      ).toThrow('Local provider id should use TraceStore directly');
    });

    it('should throw for unknown provider id', () => {
      expect(() =>
        createTraceProvider({
          id: 'unknown' as any,
          endpoint: 'http://unknown:3200',
        }),
      ).toThrow('Unknown trace provider id: unknown');
    });
  });

  describe('isExternalTraceProvider', () => {
    it('should return false for undefined config', () => {
      expect(isExternalTraceProvider(undefined)).toBe(false);
    });

    it('should return false for local id', () => {
      expect(
        isExternalTraceProvider({
          id: 'local',
          endpoint: 'http://localhost:3200',
        }),
      ).toBe(false);
    });

    it('should return false when endpoint is missing', () => {
      expect(
        isExternalTraceProvider({
          id: 'tempo',
        }),
      ).toBe(false);
    });

    it('should return true for tempo with endpoint', () => {
      expect(
        isExternalTraceProvider({
          id: 'tempo',
          endpoint: 'http://tempo:3200',
        }),
      ).toBe(true);
    });

    it('should return true for jaeger with endpoint', () => {
      expect(
        isExternalTraceProvider({
          id: 'jaeger',
          endpoint: 'http://jaeger:16686',
        }),
      ).toBe(true);
    });
  });
});
