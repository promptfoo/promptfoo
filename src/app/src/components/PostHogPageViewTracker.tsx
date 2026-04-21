import { useEffect } from 'react';

import { useLocation } from 'react-router-dom';
import { usePostHog } from './PostHogContext';

export const PostHogPageViewTracker = () => {
  const location = useLocation();
  const { posthog, isInitialized } = usePostHog();

  useEffect(() => {
    if (isInitialized && posthog) {
      // Track page view when route changes
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      });
    }
  }, [location.pathname, location.search, location.hash, isInitialized, posthog]);

  // This component doesn't render anything
  return null;
};
