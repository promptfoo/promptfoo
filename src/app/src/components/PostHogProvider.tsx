import React, { useEffect, useState } from 'react';
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

export const PostHogProvider: React.FC<PostHogProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const { email, userId, fetchEmail, fetchUserId } = useUserStore();

  // Fetch user email and ID when component mounts
  useEffect(() => {
    fetchEmail();
    fetchUserId();
  }, []);

  // Identify user when PostHog is initialized and we have user info
  const identifyUser = () => {
    if (!isInitialized || !posthog || !userId) {
      return;
    }

    posthog.identify(userId, {
      email: email || undefined,
    });
  };

  // Call identify when PostHog is initialized or user data changes
  useEffect(() => {
    if (isInitialized) {
      identifyUser();
    }
  }, [isInitialized, email, userId]);

  useEffect(() => {
    if (POSTHOG_KEY && typeof window !== 'undefined' && !DISABLE_TELEMETRY) {
      try {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          loaded: (posthogInstance: any) => {
            setIsInitialized(true);
          },
          capture_pageview: false,
          autocapture: {
            dom_event_allowlist: ['click'],
            url_allowlist: [],
          },
          disable_session_recording: true,
          session_recording: {
            maskAllInputs: true,
          },
          opt_out_capturing_by_default: process.env.NODE_ENV === 'development',
        });
      } catch (error) {
        console.error('Failed to initialize PostHog:', error);
      }
    }
  }, []);

  const value: PostHogContextType = {
    posthog: isInitialized ? posthog : null,
    isInitialized,
  };

  if (DISABLE_TELEMETRY) {
    return children;
  }

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
};

export default PostHogProvider;
