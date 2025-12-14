import { render, act } from '@testing-library/react';
import type { ContextType } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState, useEffect } from 'react';
import PylonChat from './PylonChat';
import { UserContext } from '@app/contexts/UserContextDef';

declare global {
  interface Window {
    pylon?: {
      chat_settings: {
        app_id: string;
        email?: string;
        name?: string;
        avatar_url?: string;
        email_hash?: string;
        account_id?: string;
        account_external_id?: string;
      };
    };
  }
}

describe('PylonChat', () => {
  const originalPylon = window.pylon;
  const APP_ID = 'f8db82c2-b988-49b8-815a-c3c095722397';

  const createMockUserContext = (overrides = {}): ContextType<typeof UserContext> => ({
    email: null,
    isLoading: false,
    setEmail: vi.fn(),
    pylonEmailHash: null,
    ...overrides,
  });

  const renderPylonChat = (userContext?: ContextType<typeof UserContext>) => {
    if (userContext) {
      return render(
        <UserContext value={userContext}>
          <PylonChat />
        </UserContext>,
      );
    }
    return render(<PylonChat />);
  };

  beforeEach(() => {
    delete window.pylon;
  });

  afterEach(() => {
    window.pylon = originalPylon;
    vi.unstubAllEnvs();
  });

  describe('when VITE_PROMPTFOO_NO_CHAT is not set', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_PROMPTFOO_NO_CHAT', '');
    });

    it.each([
      {
        scenario: 'user is logged in',
        userContext: { email: 'test@example.com', isLoading: false },
        expected: { app_id: APP_ID, email: 'test@example.com', name: 'test@example.com' },
      },
      {
        scenario: 'user is logged in with pylonEmailHash',
        userContext: {
          email: 'test@example.com',
          isLoading: false,
          pylonEmailHash: 'abc123hash',
        },
        expected: {
          app_id: APP_ID,
          email: 'test@example.com',
          name: 'test@example.com',
          email_hash: 'abc123hash',
        },
      },
      {
        scenario: 'user email is not defined',
        userContext: { email: null, isLoading: false },
        expected: { app_id: APP_ID },
      },
      {
        scenario: 'userContext.isLoading is true',
        userContext: { email: 'test@example.com', isLoading: true },
        expected: { app_id: APP_ID },
      },
      {
        scenario: 'userContext is undefined',
        userContext: undefined,
        expected: { app_id: APP_ID },
      },
    ])('should set chat_settings correctly when $scenario', ({ userContext, expected }) => {
      renderPylonChat(userContext ? createMockUserContext(userContext) : undefined);

      expect(window.pylon).toBeDefined();
      expect(window.pylon?.chat_settings).toEqual(expected);
    });

    it('should update chat_settings when user authentication state changes', async () => {
      const initialUserContext = createMockUserContext({
        email: 'test@example.com',
        isLoading: false,
      });

      const TestWrapper = () => {
        const [userState, setUserState] = useState(initialUserContext);

        useEffect(() => {
          (window as any).setUserState = setUserState;
        }, []);

        return (
          <UserContext value={userState}>
            <PylonChat />
          </UserContext>
        );
      };

      render(<TestWrapper />);

      expect(window.pylon?.chat_settings).toEqual({
        app_id: APP_ID,
        email: 'test@example.com',
        name: 'test@example.com',
      });

      act(() => {
        (window as any).setUserState(
          createMockUserContext({
            email: undefined,
            isLoading: false,
          }),
        );
      });

      expect(window.pylon?.chat_settings).toEqual({
        app_id: APP_ID,
      });
    });
  });

  describe('when VITE_PROMPTFOO_NO_CHAT is set', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_PROMPTFOO_NO_CHAT', 'true');
    });

    it('should not set window.pylon', () => {
      renderPylonChat(
        createMockUserContext({
          email: 'test@example.com',
          isLoading: false,
        }),
      );

      expect(window.pylon).toBeUndefined();
    });
  });
});
