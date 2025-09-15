import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditHistory from './ModelAuditHistory';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

describe.skip('ModelAuditHistory', () => {
  const mockCallApi = vi.mocked(callApi);

  const scans = [
    {
      id: '1',
      name: 'Scan 1',
      modelPath: '/path/to/model1',
      createdAt: Date.now(),
      hasErrors: true,
      results: {
        issues: [
          { severity: 'critical', message: '' },
          { severity: 'error', message: '' },
          { severity: 'warning', message: '' },
        ],
      },
      totalChecks: 10,
      passedChecks: 8,
    },
    {
      id: '2',
      name: null,
      modelPath: '/path/to/model2',
      createdAt: Date.now() - 1000,
      hasErrors: false,
      results: { issues: [] },
      totalChecks: 5,
      passedChecks: 5,
    },
  ];

  it('displays loading state initially', () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading model audit scans...')).toBeInTheDocument();
  });

  it('displays scans when data is loaded', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
      expect(screen.getByText(`Scan ${scans[1].id.slice(-8)}`)).toBeInTheDocument();
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
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('No scans found')).toBeInTheDocument();
    });
  });

  it('renders issue severity chips correctly', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('1 Critical')).toBeInTheDocument();
      expect(screen.getByText('1 Error')).toBeInTheDocument();
      expect(screen.getByText('1 Warning')).toBeInTheDocument();
    });
  });

  it('calls onScanSelected when a row is clicked', async () => {
    const onScanSelected = vi.fn();
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory onScanSelected={onScanSelected} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByText('Scan 1'));
    });
    expect(onScanSelected).toHaveBeenCalledWith('1');
  });

  it('filters scans based on quick filter input', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    render(
      <MemoryRouter>
        <ModelAuditHistory />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Scan 1')).toBeInTheDocument();
    });

    const filterInput = screen.getByRole('textbox');
    fireEvent.change(filterInput, { target: { value: 'model2' } });

    expect(screen.queryByText('Scan 1')).not.toBeInTheDocument();
    expect(screen.getByText(`Scan ${scans[1].id.slice(-8)}`)).toBeInTheDocument();
  });

  it('highlights and disables selection for focusedScanId', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    const { container } = render(
      <MemoryRouter>
        <ModelAuditHistory focusedScanId="1" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const focusedRow = container.querySelector('.focused-row');
      expect(focusedRow).toBeInTheDocument();
      expect(focusedRow).toHaveTextContent('Scan 1');
    });
  });

  it('shows/hides utility buttons based on showUtilityButtons prop', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve({ scans }) } as Response);
    const { rerender } = render(
      <MemoryRouter>
        <ModelAuditHistory showUtilityButtons={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Show columns')).toBeInTheDocument();
    });

    rerender(
      <MemoryRouter>
        <ModelAuditHistory showUtilityButtons={false} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Show columns')).not.toBeInTheDocument();
    });
  });
});
