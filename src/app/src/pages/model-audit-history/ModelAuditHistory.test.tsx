import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditHistory from './ModelAuditHistory';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

describe('ModelAuditHistory', () => {
  const mockCallApi = vi.mocked(callApi);

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans: [] }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays scans when data is loaded', async () => {
    const scans = [
      {
        id: '1',
        name: 'Scan 1',
        modelPath: '/path/to/model1',
        createdAt: Date.now(),
        hasErrors: true,
        results: { issues: [{}, {}] },
      },
    ];
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockCallApi.mockRejectedValue(new Error('Failed to fetch model audit scans'));
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Error loading scans')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch model audit scans')).toBeInTheDocument();
    });
  });

  it('displays empty state when no scans exist', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans: [] }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found.')).toBeInTheDocument();
    });
  });
});