import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  const originalWindowLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalWindowLocation, href: '' },
    });

    mockedUsePostHog.mockReturnValue({
      posthog: mockPostHog as any,
      isInitialized: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalWindowLocation,
    });
  });

  it("should call posthog.capture with '$pageview' on initial render and on route change", () => {
    const initialLocation = {
      pathname: '/dashboard',
      search: '?filter=active',
      hash: '#overview',
      state: null,
      key: 'initialKey',
    };
    mockedUseLocation.mockReturnValue(initialLocation);
    window.location.href = `http://localhost${initialLocation.pathname}${initialLocation.search}${initialLocation.hash}`;

    const { rerender } = render(<PostHogPageViewTracker />, { wrapper: MemoryRouter });

    expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
    expect(mockPostHog.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: 'http://localhost/dashboard?filter=active#overview',
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
    };
    mockedUseLocation.mockReturnValue(newLocation);
    window.location.href = `http://localhost${newLocation.pathname}`;

    rerender(<PostHogPageViewTracker />);

    expect(mockPostHog.capture).toHaveBeenCalledTimes(2);
    expect(mockPostHog.capture).toHaveBeenLastCalledWith('$pageview', {
      $current_url: 'http://localhost/settings',
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
