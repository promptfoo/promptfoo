import React, {useEffect} from 'react';
import { useLocation } from '@docusaurus/router';

/**
 * <Root> is rendered immediately under the `#__docusaurus` element in the DOM tree and never unmounts.
 * It is the highest configurable level and should be used for stateful logic that should not be re-initialized across navigations.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { pathname, hash } = location;

  /**
   * Reset scroll position to the top of the page when the pathname changes,
   * but only if not navigating to a hash anchor.
   * To navigate to specific sections of a destination page, use the `#` anchor syntax e.g. <Link to="/page#section" />
   */
  useEffect(() => {
      if (!hash) {
        document.body.scrollTo({top: 0, left: 0, behavior: 'instant'});
      }
  }, [pathname, hash]);

  return <>{children}</>;
}
