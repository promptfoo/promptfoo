import { render, screen, waitFor } from '@testing-library/react';
import { Outlet } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import App, { router } from './App';

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
  default: () => (
    <div>
      <Outlet />
    </div>
  ),
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

// Render the production route configuration at a specific location.
const renderAtRoute = async (initialEntries: string[]) => {
  await router.navigate(initialEntries[0] ?? '/');
  return render(<App />);
};

describe('App Routing', () => {
  it('renders ModelAuditLatestPage for /model-audit', async () => {
    await renderAtRoute(['/model-audit']);
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-latest-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditSetupPage for /model-audit/setup', async () => {
    await renderAtRoute(['/model-audit/setup']);
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-setup-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditHistoryPage for /model-audit/history', async () => {
    await renderAtRoute(['/model-audit/history']);
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-history-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditHistoryPage for /model-audits', async () => {
    await renderAtRoute(['/model-audits']);
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-history-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditResultPage for /model-audit/:id', async () => {
    await renderAtRoute(['/model-audit/456']);
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-result-page')).toBeInTheDocument();
    });
  });

  it('renders the not-found page for the removed model-audit legacy route', async () => {
    await renderAtRoute(['/model-audit-legacy']);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
    });
  });
});
