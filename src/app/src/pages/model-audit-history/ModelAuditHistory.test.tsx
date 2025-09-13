import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditHistory from './ModelAuditHistory';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

describe('ModelAuditHistory', () => {
  const mockCallApi = vi.mocked(callApi);

  const mockScans = [
    {
      id: '1',
      name: 'Scan 1',
      modelPath: '/path/to/model1',
      createdAt: Date.now(),
      hasErrors: true,
      results: { issues: [{}, {}] },
    },
    {
      id: '2',
      name: 'Scan 2',
      modelPath: '/path/to/model2',
      createdAt: Date.now() - 10000,
      hasErrors: false,
      results: { issues: [] },
    },
  ];

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays scans when data is loaded', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans: mockScans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
      expect(screen.getByText('Scan 2')).toBeInTheDocument();
    });
  });

  it('displays error state when API call fails', async () => {
    mockCallApi.mockRejectedValue(new Error('API Error'));
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch scans')).toBeInTheDocument();
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
