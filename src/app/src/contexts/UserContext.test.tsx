import React, { useContext } from 'react';

import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createTestQueryClient, createQueryClientWrapper } from '../test/queryClientWrapper';
import { UserProvider } from './UserContext';
import { UserContext } from './UserContextDef';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(),
  fetchUserId: vi.fn(),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

let mockUserEmail: string | null = null;
let mockIsLoading = false;

vi.mock('@app/hooks/useUser', () => ({
  useUser: () => ({
    data: { email: mockUserEmail, id: null },
    isLoading: mockIsLoading,
  }),
  useUserEmail: () => ({
    email: mockUserEmail,
    isLoading: mockIsLoading,
  }),
  useSetUserEmail: () => vi.fn(),
}));

describe('UserProvider', () => {
  const mockedCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserEmail = null;
    mockIsLoading = false;
  });

  const TestConsumer = () => {
    const context = useContext(UserContext);

    if (!context) {
      throw new Error('TestConsumer must be used within a UserProvider');
    }

    const { email, isLoading } = context;

    if (isLoading) {
      return <div>Loading...</div>;
    }

    return (
      <div>
        <h1>User Info</h1>
        <p data-testid="user-email">{email}</p>
      </div>
    );
  };

  const renderWithQueryClient = (component: React.ReactElement) => {
    const queryClient = createTestQueryClient();
    return render(component, {
      wrapper: ({ children }) => createQueryClientWrapper(queryClient, children),
    });
  };

  it('should provide user context to children', () => {
    mockUserEmail = null;

    renderWithQueryClient(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('user-email')).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    mockIsLoading = true;

    renderWithQueryClient(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display user email when available', () => {
    mockUserEmail = 'test@example.com';
    mockIsLoading = false;

    renderWithQueryClient(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com');
  });

  it('should handle null email', () => {
    mockUserEmail = null;
    mockIsLoading = false;

    renderWithQueryClient(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('user-email')).toBeInTheDocument();
    expect(screen.getByTestId('user-email')).toHaveTextContent('');
  });
});
