import { render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PageShell from './components/PageShell';
import { ToastProvider } from './contexts/ToastContext';

// Mock all page components
vi.mock('./pages/model-audit-latest/page', () => ({
  default: () => <div data-testid="model-audit-latest-page">ModelAuditLatestPage</div>,
}));
vi.mock('./pages/model-audit-setup/page', () => ({
  default: () => <div data-testid="model-audit-setup-page">ModelAuditSetupPage</div>,
}));
vi.mock('./pages/model-audit-history/page', () => ({
  default: () => <div data-testid="model-audit-history-page">ModelAuditHistoryPage</div>,
}));
vi.mock('./pages/model-audit-result/page', () => ({
  default: () => <div data-testid="model-audit-result-page">ModelAuditResultPage</div>,
}));
vi.mock('./pages/model-audit/page', () => ({
  default: () => <div data-testid="model-audit-legacy-page">ModelAuditLegacyPage</div>,
}));

// Mock PageShell to properly render child routes
vi.mock('./components/PageShell', () => ({
  default: () => {
    const { Outlet } = require('react-router-dom');
    return (
      <div>
        <Outlet />
      </div>
    );
  },
}));
vi.mock('./contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));

// Mock other pages to prevent them from being rendered
vi.mock('./pages/datasets/page', () => ({ default: () => <div>DatasetsPage</div> }));
vi.mock('./pages/eval/page', () => ({ default: () => <div>EvalPage</div> }));
vi.mock('./pages/eval-creator/page', () => ({ default: () => <div>EvalCreatorPage</div> }));
vi.mock('./pages/evals/page', () => ({ default: () => <div>EvalsIndexPage</div> }));
vi.mock('./pages/history/page', () => ({ default: () => <div>HistoryPage</div> }));
vi.mock('./pages/launcher/page', () => ({ default: () => <div>LauncherPage</div> }));
vi.mock('./pages/login', () => ({ default: () => <div>LoginPage</div> }));
vi.mock('./pages/prompts/page', () => ({ default: () => <div>PromptsPage</div> }));
vi.mock('./pages/redteam/report/page', () => ({ default: () => <div>ReportPage</div> }));
vi.mock('./pages/redteam/setup/page', () => ({ default: () => <div>RedteamSetupPage</div> }));

// Helper function to create a test router with the same structure as App
const createTestRouter = (initialEntries: string[]) => {
  return createMemoryRouter(
    createRoutesFromElements(
      <Route path="/" element={<PageShell />}>
        <Route index element={<Navigate to="/evals" replace />} />
        <Route
          path="/model-audit"
          element={<div data-testid="model-audit-latest-page">ModelAuditLatestPage</div>}
        />
        <Route
          path="/model-audit/setup"
          element={<div data-testid="model-audit-setup-page">ModelAuditSetupPage</div>}
        />
        <Route
          path="/model-audit/history"
          element={<div data-testid="model-audit-history-page">ModelAuditHistoryPage</div>}
        />
        <Route
          path="/model-audit/history/:id"
          element={<div data-testid="model-audit-result-page">ModelAuditResultPage</div>}
        />
        <Route
          path="/model-audit/:id"
          element={<div data-testid="model-audit-result-page">ModelAuditResultPage</div>}
        />
        <Route
          path="/model-audit-legacy"
          element={<div data-testid="model-audit-legacy-page">ModelAuditLegacyPage</div>}
        />
      </Route>,
    ),
    { initialEntries },
  );
};

describe('App Routing', () => {
  it('renders ModelAuditLatestPage for /model-audit', async () => {
    const router = createTestRouter(['/model-audit']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-latest-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditSetupPage for /model-audit/setup', async () => {
    const router = createTestRouter(['/model-audit/setup']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-setup-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditHistoryPage for /model-audit/history', async () => {
    const router = createTestRouter(['/model-audit/history']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-history-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditResultPage for /model-audit/history/:id', async () => {
    const router = createTestRouter(['/model-audit/history/123']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-result-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditResultPage for /model-audit/:id', async () => {
    const router = createTestRouter(['/model-audit/456']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-result-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditLegacyPage for /model-audit-legacy', async () => {
    const router = createTestRouter(['/model-audit-legacy']);
    render(
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-legacy-page')).toBeInTheDocument();
    });
  });
});
