import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTelemetry } from './useTelemetry';

describe('useTelemetry', () => {
  it('keeps telemetry call sites inert without a product-analytics sink', () => {
    const { result } = renderHook(() => useTelemetry());

    expect(result.current.isInitialized).toBe(false);
    expect(() => result.current.recordEvent('command_used', { foo: 'bar' })).not.toThrow();
    expect(() => result.current.identifyUser('user123', { plan: 'preview' })).not.toThrow();
  });
});
