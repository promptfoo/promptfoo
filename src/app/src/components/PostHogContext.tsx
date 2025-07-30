import { createContext, useContext } from 'react';

import type posthog from 'posthog-js';

export interface PostHogContextType {
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
