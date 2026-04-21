import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelAuditResultLatestPage from './ModelAuditResultLatestPage';

vi.mock('@app/utils/api');

// Mock the child components
vi.mock('../model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: unknown }) => (
    <div data-testid="results-tab">
      <span>Results: {scanResults ? 'present' : 'none'}</span>
    </div>
  ),
}));

vi.mock('../model-audit/components/ScannedFilesDialog', () => ({
  default: () => <div data-testid="files-dialog" />,
}));

vi.mock('../model-audit/components/ModelAuditSkeleton', () => ({
  LatestScanSkeleton: () => <div data-testid="loading-skeleton" />,
}));

const createMockScan = (id: string, name: string) => ({
  id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name,
  modelPath: '/test/model.bin',
  hasErrors: false,
  results: {
    path: '/test',
    success: true,
    issues: [],
  },
  totalChecks: 5,
  passedChecks: 5,
  failedChecks: 0,
  metadata: {
    originalPaths: ['/test/model.bin'],
  },
});

describe('ModelAuditResultLatestPage', () => {
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <TooltipProvider delayDuration={0}>
        <MemoryRouter>
          <ModelAuditResultLatestPage />
        </MemoryRouter>
      </TooltipProvider>,
    );
  };

  it('should show loading state initially', () => {
    mockCallApi.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderComponent();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('should show empty state when no scans exist', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [], total: 0 }),
    } as Response);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No Model Scans Yet')).toBeInTheDocument();
    });

    expect(screen.getByText('Run Your First Scan')).toBeInTheDocument();
  });

  it('should display latest scan when available', async () => {
    const mockScan = createMockScan('latest-scan', 'Latest Security Scan');

    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [mockScan], total: 1 }),
    } as Response);

    renderComponent();

    await waitFor(() => {
      // The scan name is rendered in a heading by ScanResultHeader
      expect(screen.getByRole('heading', { name: /Latest Security Scan/i })).toBeInTheDocument();
    });

    expect(screen.getByTestId('results-tab')).toBeInTheDocument();
  });

  it('should have navigation buttons', async () => {
    const mockScan = createMockScan('latest-scan', 'Test Scan');

    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [mockScan], total: 1 }),
    } as Response);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('New Scan')).toBeInTheDocument();
      // Button shows "History" not "View History" in normal state
      expect(screen.getByText('History')).toBeInTheDocument();
    });
  });

  it('should show error state on fetch failure', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: false,
    } as Response);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch latest scan')).toBeInTheDocument();
    });
  });

  it('should link to setup page from empty state', async () => {
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [], total: 0 }),
    } as Response);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Run Your First Scan')).toBeInTheDocument();
    });

    const setupLink = screen.getByText('Run Your First Scan').closest('a');
    expect(setupLink).toHaveAttribute('href', '/model-audit/setup');
  });

  it('should display scan name or default title', async () => {
    const mockScan = createMockScan('latest-scan', '');
    (mockScan as { name: string | null }).name = null;

    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [mockScan], total: 1 }),
    } as Response);

    renderComponent();

    await waitFor(() => {
      // Default title "Latest Scan Results" is used when name is null
      expect(screen.getByRole('heading', { name: /Latest Scan Results/i })).toBeInTheDocument();
    });
  });
});
