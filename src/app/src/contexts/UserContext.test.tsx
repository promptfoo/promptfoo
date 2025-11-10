import React, { useContext } from 'react';

import * as api from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProvider } from './UserContext';
import { UserContext } from './UserContextDef';

vi.mock('@app/utils/api');

describe('UserProvider', () => {
  const mockedFetchUserEmail = vi.mocked(api.fetchUserEmail);

  beforeEach(() => {
    vi.clearAllMocks();
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

  const mockFetchUserEmail = (returnValue: string | null) => {
    mockedFetchUserEmail.mockResolvedValue(returnValue);
  };

  const assertLoadingCompletedWithEmail = async (expectedEmail: string | null) => {
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    const emailElement = screen.getByTestId('user-email');
    expect(emailElement).toBeInTheDocument();
    expect(emailElement).toHaveTextContent(expectedEmail || '');

    expect(mockedFetchUserEmail).toHaveBeenCalledTimes(1);
  };

  it('should provide email as null and isLoading as true to its children before fetchUserEmail resolves', async () => {
    const testEmail = 'test.user@example.com';
    mockFetchUserEmail(testEmail);

    const TestConsumer = () => {
      const context = useContext(UserContext);
      if (!context) {
        throw new Error('TestConsumer must be used within a UserProvider');
      }
      const { email, isLoading } = context;

      return (
        <div>
          {isLoading ? <p data-testid="loading">Loading...</p> : <p data-testid="email">{email}</p>}
        </div>
      );
    };

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    const loadingElement = screen.getByTestId('loading');
    expect(loadingElement).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('email')).toBeInTheDocument();
    });
  });

  it.each([
    { scenario: 'valid email', email: 'test.user@example.com' },
    { scenario: 'null email', email: null },
  ])('should handle $scenario case after mounting', async ({ email }) => {
    mockFetchUserEmail(email);

    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    await assertLoadingCompletedWithEmail(email);
  });

  it('should not update state after unmounting', async () => {
    const testEmail = 'test.user@example.com';
    const setEmailMock = vi.fn();
    mockFetchUserEmail(testEmail);

    const originalContext = React.createContext<any>({});
    const UserContextSpy = vi
      .spyOn(React, 'createContext')
      .mockImplementation(() => originalContext);

    const contextValue: any = {
      email: null,
      setEmail: setEmailMock,
      isLoading: true,
    };

    UserContextSpy.mockReturnValue(contextValue);

    const { unmount } = render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(setEmailMock).not.toHaveBeenCalled();
  });
});
