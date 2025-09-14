import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditResultLatestPage from './ModelAuditResultLatestPage';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

vi.mock('../model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: any }) => (
    <div data-testid="results-tab">
      <span>Issues found: {scanResults?.issues?.length || 0}</span>
    </div>
  ),
}));

describe('ModelAuditResultLatestPage', () => {
  const mockCallApi = vi.mocked(callApi);

  const latestScan = {
    id: 'latest',
    name: 'Latest Scan',
    modelPath: '/path/to/latest/model',
    createdAt: Date.now(),
    results: { issues: [{}] },
  };

  const fallbackScan = {
    id: 'fallback',
    name: 'Fallback Scan',
    modelPath: '/path/to/fallback/model',
    createdAt: Date.now() - 1000,
    results: { issues: [] },
  };

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(latestScan),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading latest scan...')).toBeInTheDocument();
  });

  it('fetches and displays the latest scan via the primary endpoint', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(latestScan),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Latest Scan Results')).toBeInTheDocument();
      expect(screen.getByText(/Latest Scan/)).toBeInTheDocument();
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scans/latest', expect.any(Object));
    });
  });

  it('displays empty state when primary endpoint returns 204', async () => {
    mockCallApi.mockResolvedValue({ ok: true, status: 204 } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found')).toBeInTheDocument();
    });
  });

  it('uses fallback endpoint when primary fails', async () => {
    mockCallApi.mockRejectedValueOnce(new Error('Primary endpoint failed'));
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [fallbackScan] }),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Latest Scan Results')).toBeInTheDocument();
      expect(screen.getByText(/Fallback Scan/)).toBeInTheDocument();
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scans/latest', expect.any(Object));
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scans?limit=1', expect.any(Object));
    });
  });

  it('displays empty state when fallback returns no scans', async () => {
    mockCallApi.mockRejectedValueOnce(new Error('Primary endpoint failed'));
    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found')).toBeInTheDocument();
    });
  });

  it('displays error state when both endpoints fail', async () => {
    mockCallApi.mockRejectedValue(new Error('API Error'));
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch latest scan')).toBeInTheDocument();
    });
  });

  it('renders correct links in the empty state', async () => {
    mockCallApi.mockResolvedValue({ ok: true, status: 204 } as Response);
    render(
      <MemoryRouter>
        <ModelAuditResultLatestPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Start a Scan').closest('a')).toHaveAttribute(
        'href',
        '/model-audit/setup',
      );
      expect(screen.getByText('View History').closest('a')).toHaveAttribute(
        'href',
        '/model-audit/history',
      );
    });
  });
});
