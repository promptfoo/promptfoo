import { vi } from 'vitest';

/**
 * Creates a mock API response for use with callApi mock
 *
 * @example
 * ```typescript
 * import { createMockResponse } from '@app/test-utils/mocks';
 *
 * const callApiMock = vi.fn();
 * callApiMock.mockResolvedValueOnce(
 *   createMockResponse({ data: [{ id: '1', name: 'Test' }] })
 * );
 * ```
 */
export function createMockResponse<T>(data: T, ok = true): Response {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
  } as Response;
}

/**
 * Creates a mock toast function for use in tests
 *
 * @example
 * ```typescript
 * import { createMockToast } from '@app/test-utils/mocks';
 *
 * const mockShowToast = createMockToast();
 * vi.mock('@app/hooks/useToast', () => ({
 *   useToast: () => ({ showToast: mockShowToast }),
 * }));
 * ```
 */
export function createMockToast() {
  return vi.fn<[string, 'success' | 'error' | 'warning' | 'info'], void>();
}

/**
 * Mock implementation for callApi that returns successful responses by default
 *
 * @example
 * ```typescript
 * import { mockCallApi } from '@app/test-utils/mocks';
 *
 * const callApiMock = mockCallApi();
 * vi.mock('@app/utils/api', () => ({
 *   callApi: callApiMock,
 * }));
 * ```
 */
export function mockCallApi() {
  return vi.fn().mockResolvedValue(createMockResponse({ data: [] }));
}

/**
 * Creates a mock router navigation function
 *
 * @example
 * ```typescript
 * import { createMockNavigate } from '@app/test-utils/mocks';
 *
 * const mockNavigate = createMockNavigate();
 * vi.mock('react-router-dom', () => ({
 *   ...vi.importActual('react-router-dom'),
 *   useNavigate: () => mockNavigate,
 * }));
 * ```
 */
export function createMockNavigate() {
  return vi.fn();
}

/**
 * Creates a mock user event for testing (from @testing-library/user-event)
 * Use this when you need predictable user interactions
 *
 * @example
 * ```typescript
 * import { screen } from '@testing-library/react';
 * import { setupMockUser } from '@app/test-utils/mocks';
 *
 * const user = setupMockUser();
 * await user.click(screen.getByRole('button'));
 * ```
 */
export async function setupMockUser() {
  const { default: userEvent } = await import('@testing-library/user-event');
  return userEvent.setup();
}

/**
 * Waits for next tick (useful for async state updates)
 *
 * @example
 * ```typescript
 * import { waitForNextTick } from '@app/test-utils/mocks';
 *
 * await waitForNextTick();
 * expect(mockFn).toHaveBeenCalled();
 * ```
 */
export function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Creates a deferred promise that can be resolved/rejected manually
 *
 * @example
 * ```typescript
 * import { createDeferred } from '@app/test-utils/mocks';
 *
 * const deferred = createDeferred<string>();
 * callApiMock.mockReturnValue(deferred.promise);
 *
 * // Later in test...
 * deferred.resolve('test data');
 * ```
 */
export function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}
