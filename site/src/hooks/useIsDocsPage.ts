import { useLocation } from '@docusaurus/router';

export function useIsDocsPage(): boolean {
  const { pathname } = useLocation();
  return pathname.startsWith('/docs/') || pathname === '/docs';
}

export function useIsEventDetailPage(): boolean {
  const { pathname } = useLocation();
  // Match /events/<slug> but not /events/ or /events (index page)
  return /^\/events\/[^/]+/.test(pathname);
}
