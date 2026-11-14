/// <reference types="@vitest/browser/matchers" />

import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { createBrowserRouter, Link, Outlet, useParams, useSearchParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { EVAL_ROUTES, ROUTES } from './constants/routes';
import { createAppRoutes } from './routes';

// Use production routes and the real login redirect; stub unrelated page data/UI.
vi.mock('./components/PageShell', () => ({ default: () => <NavigationProbe /> }));
vi.mock('./hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));
vi.mock('./stores/userStore', () => ({
  useUserStore: () => ({
    email: 'router-test@example.com',
    isLoading: false,
    fetchEmail: vi.fn(),
    setEmail: vi.fn(),
  }),
}));
vi.mock('./pages/datasets/page', () => ({ default: () => <div>DatasetsPage</div> }));
vi.mock('./pages/eval/page', () => ({ default: () => <div>EvalPage</div> }));
vi.mock('./pages/eval-creator/page', () => ({ default: () => <div>EvalCreatorPage</div> }));
vi.mock('./pages/evals/page', () => ({ default: () => <div>EvalsIndexPage</div> }));
vi.mock('./pages/history/page', () => ({ default: () => <div>HistoryPage</div> }));
vi.mock('./pages/launcher/page', () => ({ default: () => <div>LauncherPage</div> }));
vi.mock('./pages/media/page', () => ({ default: () => <div>MediaPage</div> }));
vi.mock('./pages/model-audit-latest/page', () => ({
  default: () => <div>ModelAuditLatestPage</div>,
}));
vi.mock('./pages/model-audit-setup/page', () => ({
  default: () => <div>ModelAuditSetupPage</div>,
}));
vi.mock('./pages/model-audit-history/page', () => ({
  default: () => <div>ModelAuditHistoryPage</div>,
}));
vi.mock('./pages/model-audit-result/page', () => ({
  default: () => <div>ModelAuditResultPage</div>,
}));
vi.mock('./pages/NotFoundPage', () => ({ default: () => <div>NotFoundPage</div> }));
vi.mock('./pages/prompts/page', () => ({ default: () => <div>PromptsPage</div> }));
vi.mock('./pages/redteam/report/page', () => ({ default: () => <div>ReportPage</div> }));
vi.mock('./pages/redteam/setup/page', () => ({ default: () => <div>RedteamSetupPage</div> }));

function NavigationProbe() {
  const [params, setParams] = useSearchParams();
  const routeParams = useParams();
  return (
    <>
      <Link to={EVAL_ROUTES.DETAIL('example')}>Open eval</Link>
      <Link to={ROUTES.HISTORY}>Open history</Link>
      <button
        type="button"
        onClick={() =>
          setParams(
            (previous) => {
              previous.set('type', 'audio');
              return previous;
            },
            { replace: true },
          )
        }
      >
        Filter audio
      </button>
      <output data-testid="search">{params.toString()}</output>
      <output data-testid="route-params">{JSON.stringify(routeParams)}</output>
      <Outlet />
    </>
  );
}

const originalHref = window.location.href;
const originalHistoryState = window.history.state;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let router: ReturnType<typeof createBrowserRouter> | undefined;

function renderRoute(path: string, basename: string) {
  window.history.replaceState(null, '', basename + path);
  router = createBrowserRouter(createAppRoutes(), { basename });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const activeRouter = router;
  flushSync(() => root?.render(<RouterProvider router={activeRouter} />));
}

beforeEach(() => {
  vi.stubEnv('VITE_PROMPTFOO_LAUNCHER', '');
});

afterEach(() => {
  flushSync(() => root?.unmount());
  router?.dispose();
  container?.remove();
  root = undefined;
  router = undefined;
  container = undefined;
  window.history.replaceState(originalHistoryState, '', originalHref);
  vi.unstubAllEnvs();
});

describe.each(['', '/promptfoo'])('browser routing with basename "%s"', (basename) => {
  it('opens an encoded deep link and prefixes navigation links', async () => {
    renderRoute('/eval/encoded%2Fid?view=table#results', basename);
    await expect.element(page.getByText('EvalPage', { exact: true })).toBeVisible();
    await expect
      .element(page.getByTestId('route-params'))
      .toHaveTextContent(JSON.stringify({ evalId: 'encoded/id' }));
    await expect
      .element(page.getByRole('link', { name: 'Open history' }))
      .toHaveAttribute('href', basename + '/history');
    expect(window.location.pathname).toBe(basename + '/eval/encoded%2Fid');
    expect(window.location.search).toBe('?view=table');
    expect(window.location.hash).toBe('#results');
  });

  it('preserves filters across replace, link navigation, and browser Back/Forward', async () => {
    renderRoute('/media?type=image&evalId=example', basename);
    await expect.element(page.getByText('MediaPage', { exact: true })).toBeVisible();
    const historyLength = window.history.length;
    await page.getByRole('button', { name: 'Filter audio' }).click();
    await expect.element(page.getByTestId('search')).toHaveTextContent('type=audio&evalId=example');
    expect(window.location.search).toBe('?type=audio&evalId=example');
    expect(window.history.length).toBe(historyLength);

    await page.getByRole('link', { name: 'Open eval' }).click();
    await expect.element(page.getByText('EvalPage', { exact: true })).toBeVisible();
    expect(window.location.pathname).toBe(basename + '/eval/example');

    window.history.back();
    await expect.element(page.getByText('MediaPage', { exact: true })).toBeVisible();
    await expect.element(page.getByTestId('search')).toHaveTextContent('type=audio&evalId=example');
    expect(window.location.pathname).toBe(basename + '/media');

    window.history.forward();
    await expect.element(page.getByText('EvalPage', { exact: true })).toBeVisible();
    expect(window.location.pathname).toBe(basename + '/eval/example');
  });

  it.each([
    ['/', '/eval', 'EvalPage'],
    ['/dashboard', '/eval', 'EvalPage'],
    ['/dashboard/', '/eval', 'EvalPage'],
    ['/report', '/reports', 'ReportPage'],
  ])(
    'replaces %s with %s without adding a browser history entry',
    async (path, target, pageName) => {
      const historyLength = window.history.length;
      renderRoute(path, basename);
      await expect.element(page.getByText(pageName, { exact: true })).toBeVisible();
      expect(window.location.pathname).toBe(basename + target);
      expect(window.history.length).toBe(historyLength);

      await page.getByRole('link', { name: 'Open history' }).click();
      await expect.element(page.getByText('HistoryPage', { exact: true })).toBeVisible();
      window.history.back();
      await expect.element(page.getByText(pageName, { exact: true })).toBeVisible();
      expect(window.location.pathname).toBe(basename + target);
    },
  );

  it('uses the real login page to redirect to a report with query parameters', async () => {
    renderRoute('/login?redirect=%2Freports%3FevalId%3Dexample%26view%3Dtable', basename);
    await expect.element(page.getByText('ReportPage', { exact: true })).toBeVisible();
    expect(window.location.pathname).toBe(basename + '/reports');
    expect(window.location.search).toBe('?evalId=example&view=table');
  });

  it.each(['https://example.invalid/', '//example.invalid/', '%'])(
    'keeps rejected login redirect %s within the app',
    async (redirect) => {
      renderRoute('/login?redirect=' + encodeURIComponent(redirect), basename);
      await expect.element(page.getByText('EvalPage', { exact: true })).toBeVisible();
      expect(window.location.origin).toBe(new URL(originalHref).origin);
      expect(window.location.pathname).toBe(basename + '/eval');
    },
  );
});
