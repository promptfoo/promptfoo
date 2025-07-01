import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUserStore } from '@app/stores/userStore';
import posthog from 'posthog-js';

// PostHog configuration - using the same key system as the backend
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

// Use backend user ID for consistency with backend telemetry

interface PostHogContextType {
  posthog: typeof posthog | null;
  isInitialized: boolean;
}

export const PostHogContext = createContext<PostHogContextType>({
  posthog: null,
  isInitialized: false,
});

export const usePostHog = () => {
  const context = useContext(PostHogContext);
  if (!context) {
    throw new Error('usePostHog must be used within a PostHogProvider');
  }
  return context;
};

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
  }, [fetchEmail, fetchUserId]);

  // Identify user when PostHog is initialized and we have user info
  const identifyUser = () => {
    if (!isInitialized || !posthog || !userId) {
      return;
    }

    posthog.identify(userId, {
      email: email || undefined,
      ...(email && { $email: email }), // PostHog special property
    });
  };

  // Call identify when PostHog is initialized or user data changes
  useEffect(() => {
    if (isInitialized) {
      identifyUser();
    }
  }, [isInitialized, email, userId]);

  useEffect(() => {
    if (POSTHOG_KEY && typeof window !== 'undefined') {
      try {
        posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          loaded: (posthogInstance: any) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('PostHog loaded');
            }
            setIsInitialized(true);
          },
          capture_pageview: false, // Disable automatic pageview capture, we'll do it manually
          persistence: 'localStorage+cookie',
          autocapture: {
            dom_event_allowlist: ['click'], // Only capture clicks automatically
            url_allowlist: [], // Add specific URLs if needed
          },
          disable_session_recording: true,
          session_recording: {
            maskAllInputs: true, // Mask all inputs for privacy
            maskInputOptions: {
              password: true,
            },
          },
          // Disable tracking in development unless explicitly enabled
          opt_out_capturing_by_default: process.env.NODE_ENV === 'development',
          advanced_disable_decide: false,
          sanitize_properties: (properties: any, event: any) => {
            // Remove any sensitive data
            if (properties.$current_url) {
              try {
                const url = new URL(properties.$current_url);
                properties.$current_url = `${url.protocol}//${url.host}${url.pathname}`;
              } catch {
                // Keep original if URL parsing fails
              }
            }
            return properties;
          },
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

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
};

export default PostHogProvider;
