import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditResult from './ModelAuditResult';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

vi.mock('@app/pages/model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: any }) => (
    <div data-testid="results-tab">
      <span>Issues found: {scanResults?.issues?.length || 0}</span>
    </div>
  ),
}));

describe('ModelAuditResult', () => {
  const mockCallApi = vi.mocked(callApi);

  it('displays loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays scan result when data is loaded', async () => {
    const scan = {
      id: '1',
      name: 'Scan 1',
      modelPath: '/path/to/model1',
      createdAt: Date.now(),
      results: { issues: [{}, {}] },
    };
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(scan) } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
      expect(screen.getByTestId('results-tab')).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockCallApi.mockRejectedValue(new Error('API Error'));
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch scan details')).toBeInTheDocument();
    });
  });

  it('displays not found state when scan does not exist', async () => {
    mockCallApi.mockResolvedValue({ ok: false, status: 404 } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan not found.')).toBeInTheDocument();
    });
  });
});