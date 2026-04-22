import { mockWindowLocation } from '@app/tests/browserMocks';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostHog } from './PostHogContext';
import { PostHogPageViewTracker } from './PostHogPageViewTracker';

vi.mock('./PostHogContext', () => ({
  usePostHog: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(),
  };
});

const mockedUsePostHog = vi.mocked(usePostHog);
const mockedUseLocation = vi.mocked(useLocation);

describe('PostHogPageViewTracker', () => {
  const mockPostHog = {
    capture: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation({ pathname: '/', search: '', hash: '' });

    mockedUsePostHog.mockReturnValue({
      posthog: mockPostHog as any,
      isInitialized: true,
    });
  });

  it("should call posthog.capture with '$pageview' on initial render and on route change", () => {
    const initialLocation = {
      pathname: '/dashboard',
      search: '?filter=active',
      hash: '#overview',
      state: null,
      key: 'initialKey',
      unstable_mask: undefined,
    };
    mockedUseLocation.mockReturnValue(initialLocation);
    mockWindowLocation({
      pathname: initialLocation.pathname,
      search: initialLocation.search,
      hash: initialLocation.hash,
    });

    const { rerender } = render(<PostHogPageViewTracker />, { wrapper: MemoryRouter });

    expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
    expect(mockPostHog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: `${window.location.origin}/dashboard?filter=active#overview`,
      pathname: '/dashboard',
      search: '?filter=active',
      hash: '#overview',
    });

    const newLocation = {
      pathname: '/settings',
      search: '',
      hash: '',
      state: null,
      key: 'newKey',
      unstable_mask: undefined,
    };
    mockedUseLocation.mockReturnValue(newLocation);
    mockWindowLocation({
      pathname: newLocation.pathname,
      search: newLocation.search,
      hash: newLocation.hash,
    });

    rerender(<PostHogPageViewTracker />);

    expect(mockPostHog.capture).toHaveBeenCalledTimes(2);
    expect(mockPostHog.capture).toHaveBeenLastCalledWith('$pageview', {
      $current_url: `${window.location.origin}/settings`,
      pathname: '/settings',
      search: '',
      hash: '',
    });
  });

  it('should throw an error when rendered outside of a PostHogProvider', () => {
    mockedUsePostHog.mockImplementation(() => {
      throw new Error('usePostHog must be used within a PostHogProvider');
    });

    // Suppress console errors for this test since we're intentionally throwing an error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<PostHogPageViewTracker />, { wrapper: MemoryRouter });
    }).toThrowError('usePostHog must be used within a PostHogProvider');

    consoleErrorSpy.mockRestore();
  });
});
