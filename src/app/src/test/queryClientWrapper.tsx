import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Creates a QueryClient for testing with disabled retries and logging.
 * Each test should use a fresh QueryClient to avoid state leakage.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Don't retry failed queries in tests
        gcTime: 0, // Don't cache query results between tests
      },
      mutations: {
        retry: false, // Don't retry failed mutations in tests
      },
    },
  });
}

/**
 * Wrapper component that provides a QueryClient to children.
 * Use this with @testing-library/react's render function.
 *
 * @example
 * ```typescript
 * const queryClient = createTestQueryClient();
 * render(<YourComponent />, {
 *   wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
 * });
 * ```
 */
export function createQueryClientWrapper(queryClient: QueryClient, children: ReactNode) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
