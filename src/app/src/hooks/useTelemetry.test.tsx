import { usePostHog } from '@app/components/PostHogContext';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTelemetry } from './useTelemetry';

vi.mock('@app/components/PostHogContext', () => ({
  usePostHog: vi.fn(),
}));

const TEST_EVENT = 'command_used';
const TEST_PROPS = { foo: 'bar' };

describe('useTelemetry', () => {
  const mockPostHog = {
    capture: vi.fn(),
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
      expect(mockPostHog.capture).toHaveBeenCalledWith(TEST_EVENT, TEST_PROPS);
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

      expect(mockPostHog.capture).toHaveBeenCalledWith(TEST_EVENT, {});
    });
  });
});
