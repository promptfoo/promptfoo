import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, useLocation, useParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRoutes } from './routes';

const { recordEvent } = vi.hoisted(() => ({ recordEvent: vi.fn() }));

// Stub page content, not the route definitions or React Router APIs.
vi.mock('./components/PageShell', () => ({
  default: () => (
    <div data-testid="page-shell">
      <output data-testid="route-details">
        {JSON.stringify({ location: useLocation(), params: useParams() })}
      </output>
      <Outlet />
    </div>
  ),
}));
vi.mock('./hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent }),
}));
vi.mock('./pages/datasets/page', () => ({ default: () => <div>DatasetsPage</div> }));
vi.mock('./pages/eval/page', () => ({ default: () => <div>EvalPage</div> }));
vi.mock('./pages/eval-creator/page', () => ({ default: () => <div>EvalCreatorPage</div> }));
vi.mock('./pages/evals/page', () => ({ default: () => <div>EvalsIndexPage</div> }));
vi.mock('./pages/history/page', () => ({ default: () => <div>HistoryPage</div> }));
vi.mock('./pages/launcher/page', () => ({ default: () => <div>LauncherPage</div> }));
vi.mock('./pages/login', () => ({ default: () => <div>LoginPage</div> }));
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

let router: ReturnType<typeof createMemoryRouter> | undefined;

function renderRoute(path: string, basename = '', previousPath?: string) {
  router = createMemoryRouter(createAppRoutes(), {
    basename,
    initialEntries: [...(previousPath ? [basename + previousPath] : []), basename + path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.stubEnv('VITE_PROMPTFOO_LAUNCHER', '');
  recordEvent.mockReset();
});

afterEach(() => {
  cleanup();
  router?.dispose();
  router = undefined;
  vi.unstubAllEnvs();
});

describe.each(['', '/promptfoo'])('App routes with basename "%s"', (basename) => {
  it.each([
    ['/datasets', 'DatasetsPage'],
    ['/eval', 'EvalPage'],
    ['/evals', 'EvalsIndexPage'],
    ['/eval/example', 'EvalPage'],
    ['/eval/example/', 'EvalPage'],
    ['/history', 'HistoryPage'],
    ['/media', 'MediaPage'],
    ['/prompts', 'PromptsPage'],
    ['/model-audit', 'ModelAuditLatestPage'],
    ['/model-audits', 'ModelAuditHistoryPage'],
    ['/model-audit/setup', 'ModelAuditSetupPage'],
    ['/model-audit/123', 'ModelAuditResultPage'],
    ['/redteam/setup', 'RedteamSetupPage'],
    ['/reports', 'ReportPage'],
    ['/setup', 'EvalCreatorPage'],
    ['/login', 'LoginPage'],
    ['/launcher', 'NotFoundPage'],
    ['/unknown', 'NotFoundPage'],
    ['/eval/example/extra', 'NotFoundPage'],
  ])('renders the production route %s', async (path, page) => {
    const activeRouter = renderRoute(path, basename);
    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(screen.getByTestId('page-shell')).toBeInTheDocument();
    expect(activeRouter.state.location.pathname).toBe(basename + path);
    expect(activeRouter.state.errors).toBeNull();
    expect(recordEvent).toHaveBeenCalledWith('webui_page_view', { path });
  });

  it.each([
    ['/', '/eval', 'EvalPage'],
    ['/dashboard', '/eval', 'EvalPage'],
    ['/dashboard/', '/eval', 'EvalPage'],
    ['/progress', '/history', 'HistoryPage'],
    ['/model-audit/history', '/model-audits', 'ModelAuditHistoryPage'],
    ['/redteam', '/redteam/setup', 'RedteamSetupPage'],
    ['/report', '/reports', 'ReportPage'],
  ])('replaces the legacy or index route %s with %s', async (path, target, page) => {
    const activeRouter = renderRoute(path, basename, '/datasets');
    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(activeRouter.state.location.pathname).toBe(basename + target);
    expect(activeRouter.state.historyAction).toBe('REPLACE');

    await act(() => activeRouter.navigate(-1));
    expect(await screen.findByText('DatasetsPage')).toBeInTheDocument();
    expect(activeRouter.state.location.pathname).toBe(basename + '/datasets');
  });

  it.each([
    ['eval-2026-09-27T08:00:00', 'eval-2026-09-27T08:00:00'],
    ['encoded%2Fid', 'encoded/id'],
    ['%E2%9C%93', '✓'],
  ])('decodes the eval ID %s for route consumers', async (encodedId, evalId) => {
    renderRoute('/eval/' + encodedId, basename);
    await screen.findByText('EvalPage');
    const details = JSON.parse(screen.getByTestId('route-details').textContent || '{}');
    expect(details.params).toEqual({ evalId });
  });

  it('preserves query strings, hashes, and navigation state', async () => {
    const activeRouter = renderRoute('/media?type=image&evalId=example#details', basename);
    await screen.findByText('MediaPage');
    expect(activeRouter.state.location).toMatchObject({
      pathname: basename + '/media',
      search: '?type=image&evalId=example',
      hash: '#details',
    });

    await act(() =>
      activeRouter.navigate('/login?redirect=%2Feval%2Fexample%3Fview%3Dtable', {
        state: { from: 'media' },
      }),
    );
    await screen.findByText('LoginPage');
    expect(activeRouter.state.location).toMatchObject({
      pathname: basename + '/login',
      search: '?redirect=%2Feval%2Fexample%3Fview%3Dtable',
      state: { from: 'media' },
    });

    await act(() => activeRouter.navigate(-1));
    await screen.findByText('MediaPage');
    expect(activeRouter.state.location.search).toBe('?type=image&evalId=example');
    expect(activeRouter.state.location.hash).toBe('#details');
  });

  it('redirects the index to the launcher outside PageShell when enabled', async () => {
    vi.stubEnv('VITE_PROMPTFOO_LAUNCHER', 'true');
    const activeRouter = renderRoute('/', basename);
    expect(await screen.findByText('LauncherPage')).toBeInTheDocument();
    expect(screen.queryByTestId('page-shell')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(activeRouter.state.location.pathname).toBe(basename + '/launcher');
      expect(activeRouter.state.historyAction).toBe('REPLACE');
    });
  });

  it('redirects dashboard to the latest eval even when the launcher is enabled', async () => {
    vi.stubEnv('VITE_PROMPTFOO_LAUNCHER', 'true');
    const activeRouter = renderRoute('/dashboard', basename);
    expect(await screen.findByText('EvalPage')).toBeInTheDocument();
    expect(activeRouter.state.location.pathname).toBe(basename + '/eval');
    expect(activeRouter.state.historyAction).toBe('REPLACE');
  });
});
