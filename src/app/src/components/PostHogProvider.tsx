import React, { useEffect, useMemo, useState } from 'react';

import { useUserStore } from '@app/stores/userStore';
import posthog from 'posthog-js';
import { PostHogContext, type PostHogContextType } from './PostHogContext';

// PostHog configuration - using the same key system as the backend
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;
const DISABLE_TELEMETRY = import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY;

interface PostHogProviderProps {
  children: React.ReactNode;
}

export const PostHogProvider = ({ children }: PostHogProviderProps) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const { email, userId, fetchEmail, fetchUserId } = useUserStore();

  // Fetch user email and ID when component mounts
  useEffect(() => {
    fetchEmail();
    fetchUserId();
  }, [fetchEmail, fetchUserId]);

  // Identify user when PostHog is initialized and user data changes
  useEffect(() => {
    if (!isInitialized || !posthog || !userId) {
      return;
    }

    posthog.identify(userId, {
      email: email || undefined,
    });
  }, [isInitialized, email, userId]);

  useEffect(() => {
    if (POSTHOG_KEY && typeof window !== 'undefined' && DISABLE_TELEMETRY !== 'true') {
      try {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          loaded: (_posthogInstance) => {
            setIsInitialized(true);
          },
          capture_pageview: false,
          autocapture: {
            dom_event_allowlist: ['click'],
            url_allowlist: [],
          },
          session_recording: {
            maskAllInputs: true,
            maskTextFn(text, element) {
              const elementId = element?.id ?? '';
              if (!elementId.startsWith('eval-output-cell-')) {
                return text;
              }
              return '*'.repeat(text.trim().length);
            },
          },
          opt_out_capturing_by_default: import.meta.env.DEV,
          advanced_disable_decide: false,
        });
      } catch (error) {
        console.error('Failed to initialize PostHog:', error);
      }
    }
  }, []);

  const value: PostHogContextType = useMemo(
    () => ({
      posthog: isInitialized ? posthog : null,
      isInitialized,
    }),
    [isInitialized],
  );

  if (DISABLE_TELEMETRY === 'true') {
    return children;
  }

  return <PostHogContext value={value}>{children}</PostHogContext>;
};
