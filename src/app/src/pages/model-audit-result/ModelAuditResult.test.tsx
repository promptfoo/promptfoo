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

  const mockScan = {
    id: '1',
    name: 'Scan 1',
    modelPath: '/path/to/model1',
    createdAt: Date.now(),
    hasErrors: true,
    results: { issues: [{}, {}] },
  };

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    render(
      <MemoryRouter initialEntries={['/model-audit/history/1']}>
        <Routes>
          <Route path="/model-audit/history/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays scan result when data is loaded', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockScan) } as Response);
    render(
      <MemoryRouter initialEntries={['/model-audit/history/1']}>
        <Routes>
          <Route path="/model-audit/history/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan Result: Scan 1')).toBeInTheDocument();
      expect(screen.getByTestId('results-tab')).toBeInTheDocument();
      expect(screen.getByText('Issues found: 2')).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockCallApi.mockRejectedValue(new Error('API Error'));
    render(
      <MemoryRouter initialEntries={['/model-audit/history/1']}>
        <Routes>
          <Route path="/model-audit/history/:id" element={<ModelAuditResult />} />
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
      <MemoryRouter initialEntries={['/model-audit/history/1']}>
        <Routes>
          <Route path="/model-audit/history/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan not found.')).toBeInTheDocument();
    });
  });
});
