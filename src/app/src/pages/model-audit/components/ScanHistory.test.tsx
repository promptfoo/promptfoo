import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callApi } from '@app/utils/api';

import type { ScanListApiResponse, StoredScan } from '../ModelAudit.types';
import ScanHistory from './ScanHistory';

vi.mock('@app/utils/api');

const mockCallApi = vi.mocked(callApi);
const theme = createTheme();

describe('ScanHistory', () => {
  const mockScans: ScanListApiResponse = {
    scans: [
      {
        id: 'scan-1',
        createdAt: 1672531200000,
        author: 'test-user',
        description: 'First test scan',
        primaryPath: '/models/model-a.safetensors',
        issueCount: 2,
        criticalCount: 1,
        warningCount: 1,
      },
      {
        id: 'scan-2',
        createdAt: 1672617600000,
        author: null,
        description: 'Second test scan with no author',
        primaryPath: '/models/model-b.gguf',
        issueCount: 0,
        criticalCount: 0,
        warningCount: 0,
      },
    ],
    total: 2,
    limit: 10,
    offset: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('should display a table of scan history when the API returns a list of scans successfully', async () => {
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockScans),
    } as Response);

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Path' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Author' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Issues' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();

    const row1 = screen.getByText('/models/model-a.safetensors').closest('tr');
    expect(row1).not.toBeNull();
    if (row1) {
      const utils = within(row1);
      expect(
        utils.getByText(new Date(mockScans.scans[0].createdAt).toLocaleString()),
      ).toBeInTheDocument();
      expect(utils.getByText('test-user')).toBeInTheDocument();
      expect(utils.getByText('First test scan')).toBeInTheDocument();
      expect(utils.getByLabelText('1 critical issues')).toBeInTheDocument();
      expect(utils.getByLabelText('1 warnings')).toBeInTheDocument();
    }

    const row2 = screen.getByText('/models/model-b.gguf').closest('tr');
    expect(row2).not.toBeNull();
    if (row2) {
      const utils = within(row2);
      expect(
        utils.getByText(new Date(mockScans.scans[1].createdAt).toLocaleString()),
      ).toBeInTheDocument();
      expect(utils.getByText('-')).toBeInTheDocument();
      expect(utils.getByText('Second test scan with no author')).toBeInTheDocument();
      expect(utils.getByText('Clean')).toBeInTheDocument();
    }

    expect(screen.getByText('1–2 of 2')).toBeInTheDocument();
  });

  it('should call `onViewScan` with the correct scan when a scan row or the view icon is clicked and the API returns scan details successfully', async () => {
    const mockStoredScan: StoredScan = {
      id: 'scan-1',
      createdAt: 1672531200000,
      author: 'test-user',
      description: 'First test scan',
      primaryPath: '/models/model-a.safetensors',
      results: {
        path: '/models/model-a.safetensors',
        issues: [],
        success: true,
        scannedFiles: 1,
        totalFiles: 1,
        duration: 1,
        scannedFilesList: [],
      },
      config: {
        paths: ['/models/model-a.safetensors'],
        options: {
          blacklist: [],
          timeout: 300,
          verbose: false,
        },
      },
    };

    mockCallApi.mockImplementation(async (path: string) => {
      if (path === '/model-audit/scans?limit=10&offset=0') {
        return {
          ok: true,
          json: () => Promise.resolve(mockScans),
        } as Response;
      }
      if (path === '/model-audit/scans/scan-1') {
        return {
          ok: true,
          json: () => Promise.resolve(mockStoredScan),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    const row1 = screen.getByText('/models/model-a.safetensors').closest('tr');
    fireEvent.click(row1 as Element);

    await waitFor(() => {
      expect(mockOnViewScan).toHaveBeenCalledTimes(1);
      expect(mockOnViewScan).toHaveBeenCalledWith(mockStoredScan);
    });

    const viewButton = screen
      .getByText('/models/model-a.safetensors')
      .closest('tr')
      ?.querySelector<HTMLButtonElement>('button[aria-label="View scan details"]');
    fireEvent.click(viewButton as Element);

    await waitFor(() => {
      expect(mockOnViewScan).toHaveBeenCalledTimes(2);
      expect(mockOnViewScan).toHaveBeenNthCalledWith(2, mockStoredScan);
    });
  });

  it('should fetch and display the correct page of scans when the user changes the page using the pagination controls', async () => {
    const mockScansPage1: ScanListApiResponse = {
      scans: [
        {
          id: 'scan-1',
          createdAt: 1672531200000,
          author: 'test-user',
          description: 'First test scan',
          primaryPath: '/models/model-a.safetensors',
          issueCount: 2,
          criticalCount: 1,
          warningCount: 1,
        },
      ],
      total: 20,
      limit: 10,
      offset: 0,
    };

    const mockScansPage2: ScanListApiResponse = {
      scans: [
        {
          id: 'scan-11',
          createdAt: 1672531200000,
          author: 'test-user',
          description: 'Eleventh test scan',
          primaryPath: '/models/model-k.safetensors',
          issueCount: 2,
          criticalCount: 1,
          warningCount: 1,
        },
      ],
      total: 20,
      limit: 10,
      offset: 10,
    };

    mockCallApi.mockImplementation(async (path: string) => {
      if (path.includes('offset=0')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockScansPage1),
        } as Response;
      } else if (path.includes('offset=10')) {
        return {
          ok: true,
          json: () => Promise.resolve(mockScansPage2),
        } as Response;
      }
      return {
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'bad request' }),
      } as Response;
    });

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    expect(screen.getByText('/models/model-a.safetensors')).toBeInTheDocument();

    const nextPageButton = screen.getByRole('button', { name: 'Go to next page' });
    fireEvent.click(nextPageButton);

    await waitFor(() => {
      expect(screen.getByText('/models/model-k.safetensors')).toBeInTheDocument();
    });

    expect(screen.queryByText('/models/model-a.safetensors')).toBeNull();
  });

  it('should fetch and display the correct number of scans and reset to the first page when the user changes the rows per page setting', async () => {
    const mockScansPage1: ScanListApiResponse = {
      scans: [
        {
          id: 'scan-1',
          createdAt: 1672531200000,
          author: 'test-user',
          description: 'First test scan',
          primaryPath: '/models/model-a.safetensors',
          issueCount: 2,
          criticalCount: 1,
          warningCount: 1,
        },
      ],
      total: 20,
      limit: 10,
      offset: 0,
    };

    const mockScansPage2: ScanListApiResponse = {
      scans: [
        {
          id: 'scan-11',
          createdAt: 1672531200000,
          author: 'test-user',
          description: 'Eleventh test scan',
          primaryPath: '/models/model-k.safetensors',
          issueCount: 2,
          criticalCount: 1,
          warningCount: 1,
        },
        {
          id: 'scan-12',
          createdAt: 1672617600000,
          author: null,
          description: 'Twelfth test scan with no author',
          primaryPath: '/models/model-l.gguf',
          issueCount: 0,
          criticalCount: 0,
          warningCount: 0,
        },
      ],
      total: 20,
      limit: 5,
      offset: 0,
    };

    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockScansPage1),
    } as Response);

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    mockCallApi.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockScansPage2),
    } as Response);

    const rowsPerPageSelect = await screen.findByRole('combobox', { name: /Rows per page/i });
    await userEvent.click(rowsPerPageSelect);
    const option5 = await screen.findByRole('option', { name: '5' });
    await userEvent.click(option5);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scans?limit=5&offset=0');
    });
  });

  it('should display "No scan history found" message when API returns an empty array of scans', async () => {
    const emptyScans: ScanListApiResponse = {
      scans: [],
      total: 0,
      limit: 10,
      offset: 0,
    };

    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(emptyScans),
    } as Response);

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText('No scan history found')).toBeInTheDocument();
    });

    expect(screen.getByText('Run a scan to see it appear here')).toBeInTheDocument();
  });
});

describe('ScanHistory Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('should display a generic error message when the API returns a non-ok response', async () => {
    mockCallApi.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Generic API error' }),
    } as Response);

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch scan history')).toBeInTheDocument();
    });
  });

  it('should display a specific error message when a network error occurs', async () => {
    mockCallApi.mockRejectedValue(new Error('Network error'));

    const mockOnViewScan = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <ScanHistory onViewScan={mockOnViewScan} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
