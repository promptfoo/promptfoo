import { useLocation } from '@docusaurus/router';

export function useSupportsThemeChoice(): boolean {
  const { pathname } = useLocation();
  return (
    pathname.startsWith('/docs/') ||
    pathname === '/docs' ||
    // Match /events/<slug> but not /events/ or /events (index page)
    /^\/events\/[^/]+/.test(pathname) ||
    pathname === '/store' ||
    pathname === '/store/'
  );
}
