import { useCallback } from 'react';

import { usePostHog } from '@app/components/PostHogContext';

export const useTelemetry = () => {
  const { posthog, isInitialized } = usePostHog();

  const recordEvent = useCallback(
    (eventName: string, properties: Record<string, any> = {}) => {
      if (!isInitialized || !posthog) {
        return;
      }
      posthog.capture(eventName, properties);
    },
    [posthog, isInitialized],
  );

  const identifyUser = useCallback(
    (userId: string, userProperties: Record<string, any> = {}) => {
      if (!isInitialized || !posthog) {
        return;
      }

      posthog.identify(userId, userProperties);
    },
    [posthog, isInitialized],
  );

  return {
    recordEvent,
    identifyUser,
    isInitialized,
  };
};
