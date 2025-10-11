import { vi } from 'vitest';

/**
 * Utility for suppressing expected console errors in tests
 *
 * Use this when testing error cases where React/the component intentionally
 * logs errors to the console (e.g., error boundaries, context validation).
 *
 * @example
 * ```typescript
 * it('should throw error when used outside provider', () => {
 *   suppressConsoleErrors(() => {
 *     expect(() => renderHook(() => useMyHook())).toThrowError('message');
 *   });
 * });
 * ```
 *
 * @param callback - The test code that will produce console errors
 */
export function suppressConsoleErrors(callback: () => void): void {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    callback();
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

/**
 * Creates a spy on console.error that can be manually controlled
 * Useful when you need more control over when to restore the spy
 *
 * @example
 * ```typescript
 * describe('MyComponent', () => {
 *   let consoleErrorSpy: ReturnType<typeof createConsoleErrorSpy>;
 *
 *   beforeEach(() => {
 *     consoleErrorSpy = createConsoleErrorSpy();
 *   });
 *
 *   afterEach(() => {
 *     consoleErrorSpy.mockRestore();
 *   });
 *
 *   it('handles errors', () => {
 *     // Test code that may log errors
 *   });
 * });
 * ```
 */
export function createConsoleErrorSpy() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}
