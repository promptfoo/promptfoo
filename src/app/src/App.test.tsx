import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

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

// Mock other components and hooks that are not directly related to the routing test
vi.mock('./components/PageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

describe('App Routing', () => {
  it('renders ModelAuditLatestPage for /model-audit', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-latest-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditSetupPage for /model-audit/setup', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/setup']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-setup-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditHistoryPage for /model-audit/history', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/history']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-history-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditResultPage for /model-audit/history/:id', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/history/123']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-result-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditResultPage for /model-audit/:id', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit/456']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-result-page')).toBeInTheDocument();
    });
  });

  it('renders ModelAuditLegacyPage for /model-audit-legacy', async () => {
    render(
      <MemoryRouter initialEntries={['/model-audit-legacy']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('model-audit-legacy-page')).toBeInTheDocument();
    });
  });
});
