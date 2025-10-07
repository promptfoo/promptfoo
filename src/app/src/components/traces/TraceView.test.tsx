import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TraceView, { type Trace } from './TraceView';

vi.mock('./TraceTimeline', () => ({
  default: ({ trace }: { trace: { traceId: string } }) => (
    <div data-testid="trace-timeline">Trace ID: {trace.traceId}</div>
  ),
}));

describe('TraceView', () => {
  let mockFetchTraces: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetchTraces = vi.fn();
  });

  it('should render a TraceTimeline for each filtered trace that contains spans', async () => {
    const mockTraces: Trace[] = [
      {
        traceId: 'trace-abc-123',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-def-456',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    const timelines = await screen.findAllByTestId('trace-timeline');

    expect(timelines).toHaveLength(2);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    expect(screen.getByText('Trace ID: trace-abc-123')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-def-456')).toBeInTheDocument();
  });

  it('should render an Alert with the error message if the API call fails', async () => {
    const errorMessage = 'Failed to fetch traces';
    mockFetchTraces.mockRejectedValue(new Error(errorMessage));

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    });
  });

  it('should render a Typography message "No traces available for this evaluation" if the traces array is empty after fetching', async () => {
    mockFetchTraces.mockResolvedValue([]);

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    await waitFor(() => {
      expect(screen.getByText('No traces available for this evaluation')).toBeInTheDocument();
    });
  });

  it('should render a Typography message when no traces match the provided testCaseId', async () => {
    const mockTraces = [
      {
        traceId: 'trace-abc-123',
        testCaseId: 'different-test-case-id',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-def-456',
        testCaseId: 'another-different-test-case-id',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="test-case-123"
        fetchTraces={mockFetchTraces}
      />,
    );

    const message = await screen.findByText('No traces available for this test case');

    expect(message).toBeInTheDocument();
  });

  it('should render an info Alert with instructions if traces exist but none have spans', async () => {
    const mockTraces = [
      { traceId: 'trace-1', spans: [] },
      { traceId: 'trace-2', spans: [] },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(<TraceView evaluationId="eval-id" fetchTraces={mockFetchTraces} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/traces were created but no spans were received/i);
  });

  it('should render an error message when the API returns malformed JSON', async () => {
    mockFetchTraces.mockRejectedValue(new Error('Unexpected token < in JSON at position 0'));

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('Unexpected token < in JSON at position 0')).toBeInTheDocument();
  });

  it('should handle network errors when fetching traces', async () => {
    mockFetchTraces.mockRejectedValue(new Error('Network error'));

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error')).toBeInTheDocument();

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('should handle traces with non-array spans property gracefully', async () => {
    const mockTraces = [
      {
        traceId: 'trace-abc-123',
        spans: null,
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    expect(
      await screen.findByText(
        /Traces were created but no spans were received. Make sure your provider is:/,
      ),
    ).toBeInTheDocument();
  });

  it('should filter traces correctly when some traces do not have testCaseId property', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: 'test-case-1',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-2',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
      {
        traceId: 'trace-3',
        testCaseId: 'test-case-1',
        spans: [{ spanId: 'span-3', name: 'span-name-3', startTime: 5, endTime: 6 }],
      },
      {
        traceId: 'trace-4',
        testCaseId: 'test-case-2',
        spans: [{ spanId: 'span-4', name: 'span-name-4', startTime: 7, endTime: 8 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-123"
        testCaseId="test-case-1"
        fetchTraces={mockFetchTraces}
      />,
    );

    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(2);
    expect(screen.getByText('Trace ID: trace-1')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-3')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-4')).not.toBeInTheDocument();
  });

  it('should reconcile testCaseId formats using indices when traces use composed IDs', async () => {
    const mockTraces = [
      {
        traceId: 't-0',
        testCaseId: '3-1',
        spans: [{ spanId: 's1', name: 'a', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 't-1',
        testCaseId: '2-5',
        spans: [{ spanId: 's2', name: 'b', startTime: 3, endTime: 4 }],
      },
      {
        traceId: 't-2',
        testCaseId: '4-0',
        spans: [{ spanId: 's3', name: 'c', startTime: 5, endTime: 7 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="550e8400-e29b-41d4-a716-446655440000"
        testIndex={3}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-0')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-2')).not.toBeInTheDocument();
  });

  it('should display an error message when the API call returns a non-OK response', async () => {
    const mockStatus = 500;
    mockFetchTraces.mockRejectedValue(new Error(`HTTP error! status: ${mockStatus}`));

    render(<TraceView evaluationId="eval-xyz-789" fetchTraces={mockFetchTraces} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain(`HTTP error! status: ${mockStatus}`);
  });

  describe('Visibility Callback', () => {
    it('should call onVisibilityChange with false when no evaluationId is provided', async () => {
      const onVisibilityChange = vi.fn();

      render(<TraceView onVisibilityChange={onVisibilityChange} fetchTraces={mockFetchTraces} />);

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(false);
      });
    });

    it('should call onVisibilityChange with true when loading', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockImplementation(
        () => new Promise(() => {}), // Never resolves to keep loading state
      );

      render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(true);
      });
    });

    it('should call onVisibilityChange with true when there is an error', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockRejectedValue(new Error('Network error'));

      render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(true);
      });
    });

    it('should call onVisibilityChange with true when traces exist', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockResolvedValue([{ traceId: 'trace-1', spans: [] }]);

      render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(true);
      });
    });

    it('should call onVisibilityChange with false when no traces are returned', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockResolvedValue([]);

      render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(false);
      });
    });

    it('should call onVisibilityChange with true when traces is null/undefined in response', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockResolvedValue(null as any);

      render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(true);
      });
    });

    it('should update visibility when evaluationId changes', async () => {
      const onVisibilityChange = vi.fn();

      mockFetchTraces.mockResolvedValue([]);

      const { rerender } = render(
        <TraceView
          evaluationId="eval-123"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      await waitFor(() => {
        expect(onVisibilityChange).toHaveBeenCalledWith(false);
      });

      onVisibilityChange.mockClear();

      rerender(
        <TraceView
          evaluationId="eval-456"
          onVisibilityChange={onVisibilityChange}
          fetchTraces={mockFetchTraces}
        />,
      );

      expect(onVisibilityChange).toHaveBeenCalledWith(true); // Should be true during loading
    });
  });

  it('should handle mixed arrays with index fallback when testCaseId (UUID) is provided and indices are present', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '550e8400-e29b-41d4-a716-446655440000', // UUID format
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-2',
        testCaseId: '3-1', // Composed format
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
      {
        traceId: 'trace-3',
        // Missing testCaseId entirely
        spans: [{ spanId: 'span-3', name: 'span-name-3', startTime: 5, endTime: 6 }],
      },
      {
        traceId: 'trace-4',
        testCaseId: '3-1', // Another composed format matching our indices
        spans: [{ spanId: 'span-4', name: 'span-name-4', startTime: 7, endTime: 8 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    // Test with UUID testCaseId that won't match directly, but we have indices for fallback
    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="different-uuid-12345678-1234-1234-1234-123456789abc"
        testIndex={3}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    // Should fall back to index-based matching and find traces with testCaseId "3-1"
    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(2);
    expect(screen.getByText('Trace ID: trace-2')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-4')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-3')).not.toBeInTheDocument();
  });

  it('should not call the API and render null when evaluationId is an empty string', () => {
    const { container } = render(<TraceView evaluationId="" fetchTraces={mockFetchTraces} />);

    expect(mockFetchTraces).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('should call onVisibilityChange with false when evaluationId is an empty string', async () => {
    const onVisibilityChange = vi.fn();

    render(
      <TraceView
        evaluationId=""
        onVisibilityChange={onVisibilityChange}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(onVisibilityChange).toHaveBeenCalledWith(false);
    });
  });

  it('should display only traces whose testCaseId matches the provided testIndex and promptIndex when testCaseId is not provided but both indices are specified', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '1-1',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-2',
        testCaseId: '2-2',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
      {
        traceId: 'trace-3',
        testCaseId: '1-2',
        spans: [{ spanId: 'span-3', name: 'span-name-3', startTime: 5, endTime: 6 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testIndex={1}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: trace-1')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-3')).not.toBeInTheDocument();
  });

  it('should not render traces where testCaseId is a number', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: 123,
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-2',
        testCaseId: 'test-case-2',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="test-case-1"
        testIndex={1}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Trace ID: trace-1')).not.toBeInTheDocument();
    });
  });

  it('should render a message indicating no traces are available when testCaseId is malformed', async () => {
    const mockTraces = [
      {
        traceId: 'trace-abc-123',
        testCaseId: 'abc-xyz',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
      {
        traceId: 'trace-def-456',
        testCaseId: '3-test',
        spans: [{ spanId: 'span-2', name: 'span-name-2', startTime: 3, endTime: 4 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="test-case-123"
        testIndex={1}
        promptIndex={2}
        fetchTraces={mockFetchTraces}
      />,
    );

    const message = await screen.findByText('No traces available for this test case');
    expect(message).toBeInTheDocument();
  });

  it('should render "No traces available for this test case" when testIndex is negative', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={-1}
        promptIndex={0}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
    });
  });

  it('should render "No traces available for this test case" when testIndex is NaN', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={NaN}
        promptIndex={0}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
    });
  });

  it('should render "No traces available for this test case" when promptIndex is negative', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={0}
        promptIndex={-1}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
    });
  });

  it('should render "No traces available for this test case" when promptIndex is NaN', async () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={0}
        promptIndex={NaN}
        fetchTraces={mockFetchTraces}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
    });
  });

  it('filters by indices when no testCaseId is provided', async () => {
    const mockTraces = [
      { traceId: 't-a', testCaseId: '1-2', spans: [{ spanId: 's1' }] },
      { traceId: 't-b', testCaseId: '3-1', spans: [{ spanId: 's2' }] },
    ];
    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-1"
        testIndex={3}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-b')).toBeInTheDocument();
  });

  it('prefers direct testCaseId match over index fallback', async () => {
    const mockTraces = [
      { traceId: 't-direct', testCaseId: 'uuid-123', spans: [{ spanId: 's1' }] },
      { traceId: 't-fallback', testCaseId: '3-1', spans: [{ spanId: 's2' }] },
    ];
    mockFetchTraces.mockResolvedValue(mockTraces);

    render(
      <TraceView
        evaluationId="eval-1"
        testCaseId="uuid-123"
        testIndex={3}
        promptIndex={1}
        fetchTraces={mockFetchTraces}
      />,
    );

    const timelines = await screen.findAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-direct')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-fallback')).not.toBeInTheDocument();
  });
});
