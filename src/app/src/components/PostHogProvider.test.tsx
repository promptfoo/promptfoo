import { type Context, useContext } from 'react';

import { useUserStore } from '@app/stores/userStore';
import { render, screen, waitFor } from '@testing-library/react';
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostHogContextType } from './PostHogContext';

let consumerContext: Context<PostHogContextType>;

vi.mock('posthog-js', () => {
  const mockPosthogInstance = {
    init: vi.fn((_key, config) => {
      if (config.loaded) {
        setTimeout(() => config.loaded(mockPosthogInstance), 0);
      }
    }),
    identify: vi.fn(),
    capture: vi.fn(),
  };
  return {
    default: mockPosthogInstance,
  };
});

const mockFetchEmail = vi.fn();
const mockFetchUserId = vi.fn();
vi.mock('@app/stores/userStore');

const TestConsumer = () => {
  const { posthog: posthogInstance, isInitialized } = useContext(consumerContext);
  return (
    <div>
      <div data-testid="is-initialized">{isInitialized.toString()}</div>
      <div data-testid="posthog-instance">{posthogInstance ? 'loaded' : 'null'}</div>
    </div>
  );
};

describe('PostHogProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    consumerContext = (await import('./PostHogContext')).PostHogContext;

    vi.mocked(useUserStore).mockReturnValue({
      email: 'test@example.com',
      userId: 'user-123',
      fetchEmail: mockFetchEmail,
      fetchUserId: mockFetchUserId,
      isLoading: false,
      setEmail: vi.fn(),
      setUserId: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'yup', 'yeppers'])(
    'does not initialize PostHog when the disable flag is %s',
    async (flag) => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'test-posthog-key');
      vi.stubEnv('VITE_PROMPTFOO_DISABLE_TELEMETRY', flag);
      const { PostHogProvider } = await import('./PostHogProvider');
      render(
        <PostHogProvider>
          <TestConsumer />
        </PostHogProvider>,
      );

      expect(posthog.init).not.toHaveBeenCalled();
      expect(posthog.identify).not.toHaveBeenCalled();
      expect(posthog.capture).not.toHaveBeenCalled();
      expect(screen.getByTestId('is-initialized')).toHaveTextContent('false');
    },
  );

  describe('when telemetry is enabled', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'test-posthog-key');
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
      vi.stubEnv('VITE_PROMPTFOO_DISABLE_TELEMETRY', 'false');
    });

    it.each(['false', '0', '', undefined])(
      'initializes PostHog when the disable flag is %s',
      async (flag) => {
        vi.stubEnv('VITE_PROMPTFOO_DISABLE_TELEMETRY', flag);
        const { PostHogProvider } = await import('./PostHogProvider');

        render(
          <PostHogProvider>
            <TestConsumer />
          </PostHogProvider>,
        );

        expect(mockFetchEmail).toHaveBeenCalledTimes(1);
        expect(mockFetchUserId).toHaveBeenCalledTimes(1);

        expect(posthog.init).toHaveBeenCalledTimes(1);
        expect(posthog.init).toHaveBeenCalledWith(
          'test-posthog-key',
          expect.objectContaining({
            api_host: 'https://test.posthog.com',
            capture_pageview: false,
          }),
        );

        await waitFor(() => {
          expect(screen.getByTestId('is-initialized')).toHaveTextContent('true');
        });

        expect(screen.getByTestId('posthog-instance')).toHaveTextContent('loaded');
      },
    );
  });
});
