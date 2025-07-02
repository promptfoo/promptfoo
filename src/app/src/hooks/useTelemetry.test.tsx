import { renderHook, act } from '@testing-library/react';
import { usePostHog } from '@app/components/PostHogContext';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTelemetry } from './useTelemetry';

vi.mock('@app/components/PostHogContext', () => ({
  usePostHog: vi.fn(),
}));

const TEST_EVENT = 'command_used';
const TEST_PROPS = { foo: 'bar' };

describe('useTelemetry', () => {
  const mockPostHog = {
    capture: vi.fn(),
    identify: vi.fn(),
    setPersonProperties: vi.fn(),
    isFeatureEnabled: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock - PostHog is initialized and available
    vi.mocked(usePostHog).mockReturnValue({
      posthog: mockPostHog,
      isInitialized: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('recordEvent', () => {
    it('calls posthog.capture when PostHog is initialized', () => {
      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.recordEvent(TEST_EVENT, TEST_PROPS);
      });

      expect(mockPostHog.capture).toHaveBeenCalledTimes(1);
      expect(mockPostHog.capture).toHaveBeenCalledWith(
        TEST_EVENT,
        expect.objectContaining({
          ...TEST_PROPS,
          timestamp: expect.any(String),
          userAgent: expect.any(String),
          platform: 'web',
          url: expect.any(String),
          pathname: expect.any(String),
        }),
      );
    });

    it('does not call posthog.capture when PostHog is not initialized', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: mockPostHog,
        isInitialized: false,
      });

      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.recordEvent(TEST_EVENT, TEST_PROPS);
      });

      expect(mockPostHog.capture).not.toHaveBeenCalled();
    });

    it('does not call posthog.capture when posthog is null', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: null,
        isInitialized: true,
      });

      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.recordEvent(TEST_EVENT, TEST_PROPS);
      });

      expect(mockPostHog.capture).not.toHaveBeenCalled();
    });

    it('works with empty properties', () => {
      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.recordEvent(TEST_EVENT);
      });

      expect(mockPostHog.capture).toHaveBeenCalledWith(
        TEST_EVENT,
        expect.objectContaining({
          timestamp: expect.any(String),
          userAgent: expect.any(String),
          platform: 'web',
          url: expect.any(String),
          pathname: expect.any(String),
        }),
      );
    });
  });

  describe('identifyUser', () => {
    it('calls posthog.identify when PostHog is initialized', () => {
      const { result } = renderHook(() => useTelemetry());
      const userId = 'user123';
      const userProps = { name: 'Test User' };

      act(() => {
        result.current.identifyUser(userId, userProps);
      });

      expect(mockPostHog.identify).toHaveBeenCalledTimes(1);
      expect(mockPostHog.identify).toHaveBeenCalledWith(userId, userProps);
    });

    it('does not call posthog.identify when PostHog is not initialized', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: mockPostHog,
        isInitialized: false,
      });

      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.identifyUser('user123');
      });

      expect(mockPostHog.identify).not.toHaveBeenCalled();
    });

    it('works with empty user properties', () => {
      const { result } = renderHook(() => useTelemetry());
      const userId = 'user123';

      act(() => {
        result.current.identifyUser(userId);
      });

      expect(mockPostHog.identify).toHaveBeenCalledWith(userId, {});
    });
  });

  describe('setUserProperty', () => {
    it('calls posthog.setPersonProperties when PostHog is initialized', () => {
      const { result } = renderHook(() => useTelemetry());
      const properties = { role: 'admin' };

      act(() => {
        result.current.setUserProperty(properties);
      });

      expect(mockPostHog.setPersonProperties).toHaveBeenCalledTimes(1);
      expect(mockPostHog.setPersonProperties).toHaveBeenCalledWith(properties);
    });

    it('does not call posthog.setPersonProperties when PostHog is not initialized', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: mockPostHog,
        isInitialized: false,
      });

      const { result } = renderHook(() => useTelemetry());

      act(() => {
        result.current.setUserProperty({ role: 'admin' });
      });

      expect(mockPostHog.setPersonProperties).not.toHaveBeenCalled();
    });
  });

  describe('isFeatureEnabled', () => {
    it('returns feature flag value when PostHog is initialized', () => {
      mockPostHog.isFeatureEnabled.mockReturnValue(true);
      const { result } = renderHook(() => useTelemetry());

      const isEnabled = result.current.isFeatureEnabled('test-flag');

      expect(mockPostHog.isFeatureEnabled).toHaveBeenCalledWith('test-flag');
      expect(isEnabled).toBe(true);
    });

    it('returns false when PostHog is not initialized', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: mockPostHog,
        isInitialized: false,
      });

      const { result } = renderHook(() => useTelemetry());

      const isEnabled = result.current.isFeatureEnabled('test-flag');

      expect(mockPostHog.isFeatureEnabled).not.toHaveBeenCalled();
      expect(isEnabled).toBe(false);
    });

    it('returns false when posthog is null', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: null,
        isInitialized: true,
      });

      const { result } = renderHook(() => useTelemetry());

      const isEnabled = result.current.isFeatureEnabled('test-flag');

      expect(mockPostHog.isFeatureEnabled).not.toHaveBeenCalled();
      expect(isEnabled).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('returns true when PostHog is initialized', () => {
      const { result } = renderHook(() => useTelemetry());

      expect(result.current.isInitialized).toBe(true);
    });

    it('returns false when PostHog is not initialized', () => {
      vi.mocked(usePostHog).mockReturnValue({
        posthog: mockPostHog,
        isInitialized: false,
      });

      const { result } = renderHook(() => useTelemetry());

      expect(result.current.isInitialized).toBe(false);
    });
  });
});
