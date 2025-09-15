import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditResult from './ModelAuditResult';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

vi.mock('@app/pages/model-audit/components/ResultsTab', () => ({
  default: ({ scanResults }: { scanResults: any }) => (
    <div data-testid="results-tab">
      <span>Issues found: {scanResults?.issues?.length || 0}</span>
    </div>
  ),
}));

vi.mock('@mui/material', async () => {
  const actual = await vi.importActual('@mui/material');
  return {
    ...actual,
    useMediaQuery: vi.fn(() => true),
    useTheme: vi.fn(() => ({
      breakpoints: {
        down: vi.fn(() => true),
      },
    })),
  };
});

describe('ModelAuditResult', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockNavigate = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);

  // Mock URL.createObjectURL
  const mockCreateObjectURL = vi.fn(() => 'mock-url');
  const mockRevokeObjectURL = vi.fn();
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;

  const scan = {
    id: '1',
    name: 'Scan 1',
    author: 'Test Author',
    modelPath: '/path/to/model1',
    createdAt: Date.now(),
    results: { issues: [{}, {}] },
    hasErrors: true,
    totalChecks: 10,
    passedChecks: 8,
  };

  it('displays loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading scan details...')).toBeInTheDocument();
  });

  it('displays scan result when data is loaded', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(scan) } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // Target the main heading specifically (h5 element in mobile mode due to mock)
      expect(screen.getByRole('heading', { level: 5, name: 'Scan 1' })).toBeInTheDocument();
      expect(screen.getByText('Test Author')).toBeInTheDocument();
      expect(screen.getByText('8 / 10')).toBeInTheDocument();
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
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('displays not found state when scan does not exist', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // The component throws an error which is caught and displayed
      expect(screen.getByText('Failed to fetch scan details')).toBeInTheDocument();
    });
  });

  it('handles delete button click', async () => {
    mockCallApi.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(scan) } as Response);
    mockCallApi.mockResolvedValueOnce({ ok: true } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Delete scan permanently'));
    });
    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scans/1',
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/model-audit/history');
    });
  });

  it('handles delete operation fails', async () => {
    mockCallApi.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(scan) } as Response);
    mockCallApi.mockRejectedValueOnce(new Error('Failed to delete scan from API'));

    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Delete scan permanently'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to delete scan from API')).toBeInTheDocument();
    });
  });

  it('handles download button click', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(scan) } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Download scan results as JSON'));
    });
    // Just verify the URL methods were called - DOM manipulation can be unreliable in tests
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('handles refresh button click', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    });
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(scan) } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Refresh scan details'));
    });
    expect(reload).toHaveBeenCalled();
  });

  it('renders correctly when optional data is missing', async () => {
    const partialScan = { ...scan, author: null, totalChecks: null, passedChecks: null };
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(partialScan),
    } as Response);
    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      // Target the main heading specifically (h5 element in mobile mode due to mock)
      expect(screen.getByRole('heading', { level: 5, name: 'Scan 1' })).toBeInTheDocument();
      expect(screen.queryByText('Test Author')).not.toBeInTheDocument();
      expect(screen.queryByText('8 / 10')).not.toBeInTheDocument();
    });
  });


  it('displays an error message when download fails', async () => {
    mockCallApi.mockResolvedValue({ ok: true, json: () => Promise.resolve(scan) } as Response);
    mockCreateObjectURL.mockImplementation(() => {
      throw new Error('Failed to create object URL');
    });

    render(
      <MemoryRouter initialEntries={['/scans/1']}>
        <Routes>
          <Route path="/scans/:id" element={<ModelAuditResult />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      fireEvent.click(screen.getByLabelText('Download scan results as JSON'));
    });

    await waitFor(() => {
      expect(screen.getByText('Failed to download scan results')).toBeInTheDocument();
    });
  });
});
