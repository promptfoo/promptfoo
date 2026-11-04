import { useContext } from 'react';

import { useUserStore } from '@app/stores/userStore';
import { render, screen, waitFor } from '@testing-library/react';
import posthog from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('PostHogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUserStore).mockReset();

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

  it('loads user identity even when telemetry is disabled', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'test-posthog-key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
    vi.stubEnv('VITE_PROMPTFOO_DISABLE_TELEMETRY', 'true');
    const { PostHogProvider } = await import('./PostHogProvider');

    render(
      <PostHogProvider>
        <span>Page content</span>
      </PostHogProvider>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(mockFetchEmail).toHaveBeenCalledTimes(1);
    expect(mockFetchUserId).toHaveBeenCalledTimes(1);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  describe('when telemetry is enabled', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_POSTHOG_KEY', 'test-posthog-key');
      vi.stubEnv('VITE_POSTHOG_HOST', 'https://test.posthog.com');
      vi.stubEnv('VITE_PROMPTFOO_DISABLE_TELEMETRY', 'false');
    });

    it('should initialize PostHog, fetch user data, and provide context when telemetry is enabled', async () => {
      const { PostHogProvider } = await import('./PostHogProvider');
      const { PostHogContext } = await import('./PostHogContext');

      const TestConsumer = () => {
        const { posthog: posthogInstance, isInitialized } = useContext(PostHogContext);
        return (
          <div>
            <div data-testid="is-initialized">{isInitialized.toString()}</div>
            <div data-testid="posthog-instance">{posthogInstance ? 'loaded' : 'null'}</div>
          </div>
        );
      };

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
    });
  });
});
