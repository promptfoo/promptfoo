import { useCallback } from 'react';

import { usePostHog } from '@app/components/PostHogContext';

export const useTelemetry = () => {
  const { posthog, isInitialized } = usePostHog();

  const recordEvent = useCallback(
    (eventName: string, properties: Record<string, unknown> = {}) => {
      if (!isInitialized || !posthog) {
        return;
      }
      posthog.capture(eventName, properties);
    },
    [posthog, isInitialized],
  );

  return {
    recordEvent,
  };
};
