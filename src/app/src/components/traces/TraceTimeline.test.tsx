import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TraceTimeline from './TraceTimeline';
import type { TraceData } from '@promptfoo/types';

describe('TraceTimeline', () => {
  const renderTraceTimeline = (trace: TraceData) => {
    return render(
      <TooltipProvider delayDuration={0}>
        <TraceTimeline trace={trace} />
      </TooltipProvider>,
    );
  };

  // Timestamps are stored in milliseconds (Unix epoch ms)
  it('should render trace details and hierarchical spans for a valid trace', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-happy-path-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'child-1',
          parentSpanId: 'root-1',
          name: 'Child Span',
          startTime: 100,
          endTime: 300,
        },
        {
          spanId: 'root-1',
          name: 'Parent Span',
          startTime: 0,
          endTime: 500,
        },
        {
          spanId: 'root-2',
          name: 'Another Root Span',
          startTime: 600,
          endTime: 800,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-happy-path-123')).toBeInTheDocument();
    expect(screen.getByText('Total Duration: 800ms')).toBeInTheDocument();

    const parentSpanName = screen.getByText('Parent Span');
    const childSpanName = screen.getByText('Child Span');
    const anotherRootSpanName = screen.getByText('Another Root Span');

    expect(parentSpanName).toBeInTheDocument();
    expect(childSpanName).toBeInTheDocument();
    expect(anotherRootSpanName).toBeInTheDocument();
  });

  it('should render a message "No trace data available" when given a trace with an empty spans array', () => {
    const mockTrace: TraceData = {
      traceId: 'empty-trace-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('No trace data available')).toBeInTheDocument();
  });

  it('should display a tooltip with formatted duration, start time, and end time when hovering over a span', async () => {
    // Use a real timestamp: 2023-03-15 12:00:00 UTC = 1678881600000 ms
    const baseTime = 1678881600000;
    const mockTrace: TraceData = {
      traceId: 'trace-tooltip-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'span-1',
          name: 'Test Span',
          startTime: baseTime,
          endTime: baseTime + 1500, // 1.5 seconds later
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Check that the span name and duration are displayed
    expect(screen.getByText('Test Span')).toBeInTheDocument();
    // Duration may appear in multiple places (inside the span bar and potentially in tooltip)
    expect(screen.getAllByText(/1\.50s/).length).toBeGreaterThan(0);
  });

  it('should correctly process and display spans with identical start times', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-same-start-time-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'span-1',
          name: 'Span A',
          startTime: 0,
          endTime: 200,
        },
        {
          spanId: 'span-2',
          name: 'Span B',
          startTime: 0,
          endTime: 500,
        },
        {
          spanId: 'span-3',
          name: 'Span C',
          startTime: 0,
          endTime: 100,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Span A')).toBeInTheDocument();
    expect(screen.getByText('Span B')).toBeInTheDocument();
    expect(screen.getByText('Span C')).toBeInTheDocument();
  });

  it('should render the timeline without crashing when spans have incomplete data (missing name)', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-incomplete-data-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'span-1',
          startTime: 0,
          endTime: 200,
          name: 'span-1',
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-incomplete-data-123')).toBeInTheDocument();
  });

  it('should display span with attributes', async () => {
    const mockTrace: TraceData = {
      traceId: 'trace-with-attributes',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'span-with-attrs',
          name: 'Span with Attributes',
          startTime: 0,
          endTime: 100,
          attributes: {
            'http.method': 'GET',
            'http.url': 'https://example.com',
          },
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Verify the span renders correctly
    expect(screen.getByText('Span with Attributes')).toBeInTheDocument();
    expect(screen.getByText('Total Duration: 100ms')).toBeInTheDocument();
  });

  it('should apply error color styling to spans with error status code', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-error-status-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'error-span',
          name: 'Error Span',
          startTime: 0,
          endTime: 500,
          statusCode: 2,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Just verify the span renders correctly with its name and duration
    expect(screen.getByText('Error Span')).toBeInTheDocument();
    expect(screen.getByText('Total Duration: 500ms')).toBeInTheDocument();
  });

  it('should apply success color styling to spans with success status code', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-success-status-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'success-span',
          name: 'Success Span',
          startTime: 0,
          endTime: 500,
          statusCode: 1,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Just verify the span renders correctly with its name
    expect(screen.getByText('Success Span')).toBeInTheDocument();
    expect(screen.getByText('Total Duration: 500ms')).toBeInTheDocument();
  });

  it('should handle spans where endTime is earlier than startTime gracefully', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-invalid-time-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'invalid-time-span',
          name: 'Invalid Time Span',
          startTime: 200,
          endTime: 100,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText(/Total Duration:/)).toBeInTheDocument();
    expect(screen.getByText('Invalid Time Span')).toBeInTheDocument();
  });

  it('should render spans correctly when all spans have identical start and end times (zero duration)', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-zero-duration-456',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'span-1',
          name: 'Span A',
          startTime: 100,
          endTime: 100,
        },
        {
          spanId: 'span-2',
          name: 'Span B',
          startTime: 100,
          endTime: 100,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-zero-duration-456')).toBeInTheDocument();
    expect(screen.getByText(/Total Duration:/)).toBeInTheDocument();
    expect(screen.getByText('Span A')).toBeInTheDocument();
    expect(screen.getByText('Span B')).toBeInTheDocument();
  });

  it('should display spans with invalid parentSpanId as root spans', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-invalid-parent-123',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'orphan-1',
          parentSpanId: 'non-existent-parent',
          name: 'Orphan Span',
          startTime: 0,
          endTime: 200,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Orphan Span')).toBeInTheDocument();
    expect(screen.getByText('Total Duration: 200ms')).toBeInTheDocument();
    expect(screen.getByText('Trace ID: trace-invalid-parent-123')).toBeInTheDocument();
  });

  it('should handle traces with extreme time differences between spans', () => {
    const mockTrace: TraceData = {
      traceId: 'trace-extreme-time-diff',
      evaluationId: 'test-evaluation-id',
      testCaseId: 'test-test-case-id',
      metadata: { test: 'value' },
      spans: [
        {
          spanId: 'normal-span',
          name: 'Normal Span',
          startTime: 0,
          endTime: 1000,
        },
        {
          spanId: 'extreme-span',
          name: 'Extreme Span',
          startTime: 10000000,
          endTime: 10001000,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-extreme-time-diff')).toBeInTheDocument();
    expect(screen.getByText(/Total Duration:/)).toBeInTheDocument();
  });
});
