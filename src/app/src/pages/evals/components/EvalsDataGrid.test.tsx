import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callApi } from '@app/utils/api';
import EvalsDataGrid from './EvalsDataGrid';
import { useState } from 'react';
import { act } from '@testing-library/react';

// Mock the API
vi.mock('@app/utils/api');

// Mock the DataGrid component to simplify testing
vi.mock('@mui/x-data-grid', () => ({
  DataGrid: ({ rows, loading, slots, getRowClassName }: any) => {
    if (loading && slots?.loadingOverlay) {
      const LoadingOverlay = slots.loadingOverlay;
      return <LoadingOverlay />;
    }

    if (!loading && rows.length === 0 && slots?.noRowsOverlay) {
      const NoRowsOverlay = slots.noRowsOverlay;
      return <NoRowsOverlay />;
    }

    return (
      <div data-testid="data-grid">
        {!loading &&
          rows.map((row: any) => {
            const className = getRowClassName ? getRowClassName({ id: row.evalId }) : '';
            return (
              <div key={row.evalId} data-testid={`eval-${row.evalId}`} className={className}>
                {row.description || row.label}
              </div>
            );
          })}
      </div>
    );
  },
  GridToolbarContainer: ({ children }: any) => <div>{children}</div>,
  GridToolbarColumnsButton: () => <div />,
  GridToolbarDensitySelector: () => <div />,
  GridToolbarFilterButton: () => <div />,
  GridToolbarQuickFilter: () => <div />,
  GridToolbarExportContainer: () => <div />,
  GridCsvExportMenuItem: () => <div />,
}));

const mockEvals = [
  {
    evalId: 'eval-1',
    createdAt: Date.now(),
    description: 'Original Description',
    datasetId: 'dataset-1',
    isRedteam: 0,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: Date.now(),
    description: 'Another Eval',
    datasetId: 'dataset-1',
    isRedteam: 0,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
];

const mockEvalsWithMultipleDatasets = [
  {
    evalId: 'eval-1',
    createdAt: Date.now(),
    description: 'Eval 1 - Dataset 1',
    datasetId: 'dataset-1',
    isRedteam: 0,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: Date.now(),
    description: 'Eval 2 - Dataset 1',
    datasetId: 'dataset-1',
    isRedteam: 0,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
  {
    evalId: 'eval-3',
    createdAt: Date.now(),
    description: 'Eval 3 - Dataset 2',
    datasetId: 'dataset-2',
    isRedteam: 0,
    label: 'eval-3',
    numTests: 8,
    passRate: 75,
  },
];

const mockEvalsWithDifferentDatasets = [
  {
    evalId: 'eval-1',
    createdAt: Date.now(),
    description: 'Original Description',
    datasetId: 'dataset-1',
    isRedteam: 0,
    label: 'eval-1',
    numTests: 10,
    passRate: 90,
  },
  {
    evalId: 'eval-2',
    createdAt: Date.now(),
    description: 'Another Eval',
    datasetId: 'dataset-2',
    isRedteam: 0,
    label: 'eval-2',
    numTests: 5,
    passRate: 100,
  },
];

describe('EvalsDataGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data on initial mount', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith(
        '/results',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Original Description');
      expect(screen.getByTestId('eval-eval-2')).toHaveTextContent('Another Eval');
    });
  });

  it('should refetch data when location changes', async () => {
    let callCount = 0;

    vi.mocked(callApi).mockImplementation(async () => {
      callCount++;

      if (callCount === 1) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ data: mockEvals }),
        } as any;
      }

      // Second call returns updated data
      const updatedEvals = [
        {
          ...mockEvals[0],
          description: 'Updated Description',
        },
        mockEvals[1],
      ];

      return {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: updatedEvals }),
      } as any;
    });

    // Create a wrapper component that simulates navigation
    const NavigationWrapper = () => {
      const navigate = useNavigate();

      React.useEffect(() => {
        // Navigate away and back after initial render
        const timer = setTimeout(async () => {
          navigate('/eval/eval-1');
          // Small delay to let the navigation happen
          setTimeout(() => {
            navigate('/evals');
          }, 50);
        }, 100);
        return () => clearTimeout(timer);
      }, [navigate]);

      return <EvalsDataGrid onEvalSelected={vi.fn()} />;
    };

    const TestComponent = () => (
      <Routes>
        <Route path="/evals" element={<NavigationWrapper />} />
        <Route path="/eval/:id" element={<div>Edit page</div>} />
      </Routes>
    );

    render(
      <MemoryRouter initialEntries={['/evals']}>
        <TestComponent />
      </MemoryRouter>,
    );

    // Wait for initial load
    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    // Wait for navigation and refetch
    await waitFor(
      () => {
        expect(callApi).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    // Verify updated data is displayed
    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Updated Description');
    });
  });

  it('should refetch data when query parameters change but pathname remains the same', async () => {
    let callCount = 0;

    vi.mocked(callApi).mockImplementation(async () => {
      callCount++;

      if (callCount === 1) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ data: mockEvals }),
        } as any;
      }

      const updatedEvals = [
        {
          ...mockEvals[0],
          description: 'Updated Description with Query Params',
        },
        mockEvals[1],
      ];

      return {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: updatedEvals }),
      } as any;
    });

    // Create a wrapper component that can trigger navigation
    const NavigationWrapper = () => {
      const navigate = useNavigate();

      // Trigger navigation after initial render
      React.useEffect(() => {
        // Small delay to ensure initial render completes
        const timer = setTimeout(() => {
          navigate('/evals?param2=value2');
        }, 100);
        return () => clearTimeout(timer);
      }, [navigate]);

      return <EvalsDataGrid onEvalSelected={vi.fn()} />;
    };

    render(
      <MemoryRouter initialEntries={['/evals?param1=value1']}>
        <Routes>
          <Route path="/evals" element={<NavigationWrapper />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for initial load
    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    // Wait for navigation and second fetch
    await waitFor(
      () => {
        expect(callApi).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent(
        'Updated Description with Query Params',
      );
    });
  });

  it('should handle fetch errors gracefully', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Failed to fetch evals'));

    render(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error loading evals')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch evals')).toBeInTheDocument();
    });
  });

  it('should display only evals with the same datasetId as the focused eval when filterByDatasetId is true', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvalsWithMultipleDatasets }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} focusedEvalId="eval-1" filterByDatasetId={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith(
        '/results',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Eval 1 - Dataset 1');
      expect(screen.getByTestId('eval-eval-2')).toHaveTextContent('Eval 2 - Dataset 1');
      expect(screen.queryByTestId('eval-eval-3')).toBeNull();
    });
  });

  it('should visually mark the row corresponding to focusedEvalId as focused when focusedEvalId is provided', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    render(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} focusedEvalId="eval-1" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith(
        '/results',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveClass('focused-row');
    });
  });

  it('should filter data when filterByDatasetId changes from false to true after initial load', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvalsWithDifferentDatasets }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const { rerender } = render(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} focusedEvalId="eval-1" filterByDatasetId={false} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledWith(
        '/results',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Original Description');
      expect(screen.getByTestId('eval-eval-2')).toHaveTextContent('Another Eval');
    });

    rerender(
      <MemoryRouter>
        <EvalsDataGrid onEvalSelected={vi.fn()} focusedEvalId="eval-1" filterByDatasetId={true} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Original Description');
      expect(screen.queryByTestId('eval-eval-2')).toBeNull();
    });
  });

  it('should fetch data on remount without pathname change', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: mockEvals }),
    };
    vi.mocked(callApi).mockResolvedValue(mockResponse as any);

    const WrapperComponent = () => {
      const [isVisible, setIsVisible] = useState(true);

      return (
        <>
          {isVisible && <EvalsDataGrid onEvalSelected={vi.fn()} />}
          <button onClick={() => setIsVisible(false)}>Unmount</button>
          <button onClick={() => setIsVisible(true)}>Remount</button>
        </>
      );
    };

    render(
      <MemoryRouter>
        <WrapperComponent />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Original Description');
    });

    await act(async () => {
      screen.getByText('Unmount').click();
    });

    await act(async () => {
      screen.getByText('Remount').click();
    });

    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Original Description');
    });
  });

  it('should handle race conditions by aborting previous requests on rapid navigation', async () => {
    let callCount = 0;
    let resolveSecondRequest: any;

    // Mock callApi to simulate delayed responses
    vi.mocked(callApi).mockImplementation(async (path, options) => {
      callCount++;

      if (callCount === 1) {
        // First request - will be aborted
        return new Promise((resolve) => {
          // Check if request was aborted
          options?.signal?.addEventListener('abort', () => {
            resolve({
              ok: false,
              json: () =>
                Promise.reject(new DOMException('The operation was aborted', 'AbortError')),
            } as any);
          });
        });
      }

      // Second request - should complete normally
      return new Promise((resolve) => {
        resolveSecondRequest = resolve;
        setTimeout(() => {
          resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
              data: [
                {
                  ...mockEvals[0],
                  description: 'Updated after navigation',
                },
                mockEvals[1],
              ],
            }),
          } as any);
        }, 10);
      });
    });

    const NavigationWrapper = () => {
      const navigate = useNavigate();

      React.useEffect(() => {
        // Trigger rapid navigation changes
        const timer1 = setTimeout(() => {
          navigate('/evals?filter=1');
        }, 50);
        const timer2 = setTimeout(() => {
          navigate('/evals?filter=2');
        }, 100);

        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }, [navigate]);

      return <EvalsDataGrid onEvalSelected={vi.fn()} />;
    };

    render(
      <MemoryRouter initialEntries={['/evals']}>
        <Routes>
          <Route path="/evals" element={<NavigationWrapper />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for initial request
    await waitFor(() => {
      expect(callApi).toHaveBeenCalledTimes(1);
    });

    // Wait for rapid navigations to trigger more requests
    await waitFor(
      () => {
        expect(callApi).toHaveBeenCalledTimes(3);
      },
      { timeout: 3000 },
    );

    // Resolve the second request
    if (resolveSecondRequest) {
      resolveSecondRequest({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              ...mockEvals[0],
              description: 'Updated after navigation',
            },
            mockEvals[1],
          ],
        }),
      });
    }

    // Verify that only the latest request's data is displayed
    await waitFor(() => {
      expect(screen.getByTestId('eval-eval-1')).toHaveTextContent('Updated after navigation');
    });

    // The first request should have been aborted and not display "Original Description"
    expect(screen.queryByText('Original Description')).not.toBeInTheDocument();
  });
});
