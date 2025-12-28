import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TraceView, { type Trace } from './TraceView';

vi.mock('./TraceTimeline', () => ({
  default: ({ trace }: { trace: { traceId: string } }) => (
    <div data-testid="trace-timeline">Trace ID: {trace.traceId}</div>
  ),
}));

describe('TraceView', () => {
  it('should render a TraceTimeline for each filtered trace that contains spans', () => {
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

    render(<TraceView evaluationId="eval-xyz-789" traces={mockTraces} />);

    const timelines = screen.getAllByTestId('trace-timeline');

    expect(timelines).toHaveLength(2);
    expect(screen.getByText('Trace ID: trace-abc-123')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-def-456')).toBeInTheDocument();
  });

  it('should render a Typography message "No traces available for this evaluation" if the traces array is empty', () => {
    render(<TraceView evaluationId="eval-xyz-789" traces={[]} />);

    expect(screen.getByText('No traces available for this evaluation')).toBeInTheDocument();
  });

  it('should render a Typography message when no traces match the provided testCaseId', () => {
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

    render(
      <TraceView evaluationId="eval-xyz-789" testCaseId="test-case-123" traces={mockTraces} />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('should render an info Alert with instructions if traces exist but none have spans', () => {
    const mockTraces = [
      { traceId: 'trace-1', spans: [] },
      { traceId: 'trace-2', spans: [] },
    ];

    render(<TraceView evaluationId="eval-id" traces={mockTraces} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/traces were created but no spans were received/i);
  });

  it('should handle traces with non-array spans property gracefully', () => {
    const mockTraces = [
      {
        traceId: 'trace-abc-123',
        spans: null as any,
      },
    ];

    render(<TraceView evaluationId="eval-xyz-789" traces={mockTraces} />);

    expect(
      screen.getByText(
        /Traces were created but no spans were received. Make sure your provider is:/,
      ),
    ).toBeInTheDocument();
  });

  it('should filter traces correctly when some traces do not have testCaseId property', () => {
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

    render(<TraceView evaluationId="eval-123" testCaseId="test-case-1" traces={mockTraces} />);

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(2);
    expect(screen.getByText('Trace ID: trace-1')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-3')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-4')).not.toBeInTheDocument();
  });

  it('should reconcile testCaseId formats using indices when traces use composed IDs', () => {
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

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="550e8400-e29b-41d4-a716-446655440000"
        testIndex={3}
        promptIndex={1}
        traces={mockTraces}
      />,
    );

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-0')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-2')).not.toBeInTheDocument();
  });

  it('should handle mixed arrays with index fallback when testCaseId (UUID) is provided and indices are present', () => {
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

    // Test with UUID testCaseId that won't match directly, but we have indices for fallback
    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="different-uuid-12345678-1234-1234-1234-123456789abc"
        testIndex={3}
        promptIndex={1}
        traces={mockTraces}
      />,
    );

    // Should fall back to index-based matching and find traces with testCaseId "3-1"
    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(2);
    expect(screen.getByText('Trace ID: trace-2')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-4')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-3')).not.toBeInTheDocument();
  });

  it('should render null when evaluationId is not provided', () => {
    const { container } = render(<TraceView traces={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render null when evaluationId is an empty string', () => {
    const { container } = render(<TraceView evaluationId="" traces={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('should display only traces whose testCaseId matches the provided testIndex and promptIndex when testCaseId is not provided but both indices are specified', () => {
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

    render(
      <TraceView evaluationId="eval-xyz-789" testIndex={1} promptIndex={1} traces={mockTraces} />,
    );

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: trace-1')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID: trace-3')).not.toBeInTheDocument();
  });

  it('should not render traces where testCaseId is a number', () => {
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

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="test-case-1"
        testIndex={1}
        promptIndex={1}
        traces={mockTraces}
      />,
    );

    expect(screen.queryByText('Trace ID: trace-1')).not.toBeInTheDocument();
  });

  it('should render a message indicating no traces are available when testCaseId is malformed', () => {
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

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="test-case-123"
        testIndex={1}
        promptIndex={2}
        traces={mockTraces}
      />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('should render "No traces available for this test case" when testIndex is negative', () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={-1}
        promptIndex={0}
        traces={mockTraces}
      />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('should render "No traces available for this test case" when testIndex is NaN', () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={NaN}
        promptIndex={0}
        traces={mockTraces}
      />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('should render "No traces available for this test case" when promptIndex is negative', () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={0}
        promptIndex={-1}
        traces={mockTraces}
      />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('should render "No traces available for this test case" when promptIndex is NaN', () => {
    const mockTraces = [
      {
        traceId: 'trace-1',
        testCaseId: '0-0',
        spans: [{ spanId: 'span-1', name: 'span-name-1', startTime: 1, endTime: 2 }],
      },
    ];

    render(
      <TraceView
        evaluationId="eval-xyz-789"
        testCaseId="some-uuid"
        testIndex={0}
        promptIndex={NaN}
        traces={mockTraces}
      />,
    );

    expect(screen.getByText('No traces available for this test case')).toBeInTheDocument();
  });

  it('filters by indices when no testCaseId is provided', () => {
    const mockTraces = [
      { traceId: 't-a', testCaseId: '1-2', spans: [{ spanId: 's1' }] },
      { traceId: 't-b', testCaseId: '3-1', spans: [{ spanId: 's2' }] },
    ];

    render(<TraceView evaluationId="eval-1" testIndex={3} promptIndex={1} traces={mockTraces} />);

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-b')).toBeInTheDocument();
  });

  it('prefers direct testCaseId match over index fallback', () => {
    const mockTraces = [
      { traceId: 't-direct', testCaseId: 'uuid-123', spans: [{ spanId: 's1' }] },
      { traceId: 't-fallback', testCaseId: '3-1', spans: [{ spanId: 's2' }] },
    ];

    render(
      <TraceView
        evaluationId="eval-1"
        testCaseId="uuid-123"
        testIndex={3}
        promptIndex={1}
        traces={mockTraces}
      />,
    );

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(1);
    expect(screen.getByText('Trace ID: t-direct')).toBeInTheDocument();
    expect(screen.queryByText('Trace ID: t-fallback')).not.toBeInTheDocument();
  });

  it('should show all traces for an evaluation when no filtering is specified', () => {
    const mockTraces = [
      { traceId: 't-1', testCaseId: 'test-1', spans: [{ spanId: 's1' }] },
      { traceId: 't-2', testCaseId: 'test-2', spans: [{ spanId: 's2' }] },
      { traceId: 't-3', testCaseId: 'test-3', spans: [{ spanId: 's3' }] },
    ];

    render(<TraceView evaluationId="eval-1" traces={mockTraces} />);

    const timelines = screen.getAllByTestId('trace-timeline');
    expect(timelines).toHaveLength(3);
    expect(screen.getByText('Trace ID: t-1')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: t-2')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: t-3')).toBeInTheDocument();
  });
});
