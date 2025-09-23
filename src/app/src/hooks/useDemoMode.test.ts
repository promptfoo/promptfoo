import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useDemoMode from './useDemoMode';

describe('useDemoMode', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    // Reset import.meta.env to a fresh object for each test
    vi.stubGlobal('import.meta', {
      env: { ...originalEnv },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return isDemoMode as true when VITE_PUBLIC_PROMPTFOO_DEMO_MODE is "true"', () => {
    // @ts-ignore - we're mocking import.meta.env
    import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = 'true';

    const { result } = renderHook(() => useDemoMode());

    expect(result.current.isDemoMode).toBe(true);
  });

  it('should return isDemoMode as false when VITE_PUBLIC_PROMPTFOO_DEMO_MODE is "false"', () => {
    // @ts-ignore - we're mocking import.meta.env
    import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = 'false';

    const { result } = renderHook(() => useDemoMode());

    expect(result.current.isDemoMode).toBe(false);
  });

  it('should return isDemoMode as false when VITE_PUBLIC_PROMPTFOO_DEMO_MODE is undefined', () => {
    // @ts-ignore - we're mocking import.meta.env
    delete import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE;

    const { result } = renderHook(() => useDemoMode());

    expect(result.current.isDemoMode).toBe(false);
  });

  it('should return isDemoMode as false when VITE_PUBLIC_PROMPTFOO_DEMO_MODE is an empty string', () => {
    // @ts-ignore - we're mocking import.meta.env
    import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = '';

    const { result } = renderHook(() => useDemoMode());

    expect(result.current.isDemoMode).toBe(false);
  });

  it('should return isDemoMode as false when VITE_PUBLIC_PROMPTFOO_DEMO_MODE has any value other than "true"', () => {
    const testValues = ['True', 'TRUE', '1', 'yes', 'on', 'random-value'];

    testValues.forEach((value) => {
      // @ts-ignore - we're mocking import.meta.env
      import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = value;

      const { result } = renderHook(() => useDemoMode());

      expect(result.current.isDemoMode).toBe(false);
    });
  });

  it('should return a consistent object structure', () => {
    const { result } = renderHook(() => useDemoMode());

    expect(result.current).toHaveProperty('isDemoMode');
    expect(typeof result.current.isDemoMode).toBe('boolean');
  });

  it('should be a pure function that returns the same value for the same environment', () => {
    // @ts-ignore - we're mocking import.meta.env
    import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = 'true';

    const { result: result1 } = renderHook(() => useDemoMode());
    const { result: result2 } = renderHook(() => useDemoMode());

    expect(result1.current.isDemoMode).toBe(result2.current.isDemoMode);
    expect(result1.current.isDemoMode).toBe(true);
  });

  it('should not rerender when called multiple times with the same environment', () => {
    // @ts-ignore - we're mocking import.meta.env
    import.meta.env.VITE_PUBLIC_PROMPTFOO_DEMO_MODE = 'true';

    let renderCount = 0;
    const { result, rerender } = renderHook(() => {
      renderCount++;
      return useDemoMode();
    });

    expect(renderCount).toBe(1);
    expect(result.current.isDemoMode).toBe(true);

    // Rerender without changing the environment
    rerender();

    expect(renderCount).toBe(2);
    expect(result.current.isDemoMode).toBe(true);
  });
});
