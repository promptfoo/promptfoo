import { useCallback } from 'react';
import { usePostHog } from '@app/components/PostHogContext';

/**
 * Hook for tracking telemetry events, similar to the backend telemetry system
 */
export const useTelemetry = () => {
  const { posthog, isInitialized } = usePostHog();

  const recordEvent = useCallback(
    (eventName: string, properties: Record<string, any> = {}) => {
      if (!isInitialized || !posthog) {
        return;
      }

      // Add common metadata similar to backend telemetry
      const propertiesWithMetadata = {
        ...properties,
        // Add common properties that might be useful
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        platform: 'web',
        url: window.location.href,
        pathname: window.location.pathname,
      };

      posthog.capture(eventName, propertiesWithMetadata);
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

  const setUserProperty = useCallback(
    (properties: Record<string, any>) => {
      if (!isInitialized || !posthog) {
        return;
      }

      posthog.setPersonProperties(properties);
    },
    [posthog, isInitialized],
  );

  const isFeatureEnabled = useCallback(
    (flagKey: string) => {
      if (!isInitialized || !posthog) {
        return false;
      }

      return posthog.isFeatureEnabled(flagKey);
    },
    [posthog, isInitialized],
  );

  return {
    recordEvent,
    identifyUser,
    setUserProperty,
    isFeatureEnabled,
    isInitialized,
  };
};
