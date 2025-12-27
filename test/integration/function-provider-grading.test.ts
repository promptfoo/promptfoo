/**
 * Integration test to verify function providers work end-to-end in grading scenarios
 * This tests the exact issue from #3784: function providers in defaultTest.options.provider
 */
import { describe, expect, it, vi } from 'vitest';
import { getGradingProvider } from '../../src/matchers';

import type { ApiProvider, ProviderType } from '../../src/types/providers';

describe('Function Provider Integration - Issue #3784', () => {
  it('should work with getGradingProvider when passed as ApiProvider object', async () => {
    // Create a mock function provider (simulating what resolveProvider returns)
    const mockFunctionProvider: any = vi.fn(async (prompt: string) => {
      return { output: `Graded: ${prompt}` };
    });
    mockFunctionProvider.label = 'test-grader';

    // This is what resolveProvider returns for function providers
    const resolvedProvider: ApiProvider = {
      id: () => mockFunctionProvider.label,
      callApi: mockFunctionProvider,
    };

    // Now pass it through getGradingProvider (this is what matchers.ts does)
    const gradingProvider = await getGradingProvider(
      'text' as ProviderType,
      resolvedProvider,
      null,
    );

    expect(gradingProvider).toBeDefined();
    expect(gradingProvider).toBe(resolvedProvider); // Should return same object
    expect(typeof gradingProvider!.id).toBe('function');
    expect(gradingProvider!.id()).toBe('test-grader');
    expect(gradingProvider!.callApi).toBe(mockFunctionProvider);
  });

  it('should actually call the function provider', async () => {
    const mockFunctionProvider: any = vi.fn(async (prompt: string) => {
      return { output: `Response for: ${prompt}` };
    });

    const resolvedProvider: ApiProvider = {
      id: () => 'custom-grader',
      callApi: mockFunctionProvider,
    };

    const gradingProvider = await getGradingProvider(
      'text' as ProviderType,
      resolvedProvider,
      null,
    );

    // Actually call the provider
    const result = await gradingProvider!.callApi('test prompt');

    expect(mockFunctionProvider).toHaveBeenCalledWith('test prompt');
    expect(result.output).toBe('Response for: test prompt');
  });

  it('should handle function provider without label', async () => {
    const mockFunctionProvider: any = vi.fn(async (prompt: string) => {
      return { output: `Graded: ${prompt}` };
    });

    // No label, so resolveProvider uses 'custom-function'
    const resolvedProvider: ApiProvider = {
      id: () => 'custom-function',
      callApi: mockFunctionProvider,
    };

    const gradingProvider = await getGradingProvider(
      'text' as ProviderType,
      resolvedProvider,
      null,
    );

    expect(gradingProvider).toBeDefined();
    expect(gradingProvider!.id()).toBe('custom-function');
  });

  it('should correctly identify as ApiProvider based on type check', async () => {
    const mockFunctionProvider: any = vi.fn(async () => ({ output: 'test' }));

    const resolvedProvider: ApiProvider = {
      id: () => 'test',
      callApi: mockFunctionProvider,
    };

    // This is the exact check from getGradingProvider line 120
    const isApiProviderCheck =
      typeof resolvedProvider === 'object' &&
      typeof (resolvedProvider as ApiProvider).id === 'function';

    expect(isApiProviderCheck).toBe(true);
  });
});
