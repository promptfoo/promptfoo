import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../test/queryClientWrapper';
import { PostHogProvider } from './PostHogProvider';

let mockUserEmail: string | null = null;
let mockUserId: string | null = null;

vi.mock('@app/hooks/useUser', () => ({
  useUserEmail: () => ({ data: mockUserEmail, isLoading: false }),
  useUserId: () => ({ data: mockUserId, isLoading: false }),
}));

describe('PostHogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserEmail = null;
    mockUserId = null;
  });

  it('should render children', () => {
    const queryClient = createTestQueryClient();
    const { getByText } = render(
      <PostHogProvider>
        <div>Test Child</div>
      </PostHogProvider>,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('should handle user email and ID', async () => {
    mockUserEmail = 'test@example.com';
    mockUserId = 'user-123';

    const queryClient = createTestQueryClient();
    const { getByText } = render(
      <PostHogProvider>
        <div>Test Child</div>
      </PostHogProvider>,
      {
        wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
      },
    );

    await waitFor(() => {
      expect(getByText('Test Child')).toBeInTheDocument();
    });
  });
});
