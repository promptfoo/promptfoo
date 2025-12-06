import { createTheme, Theme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import TraceTimeline from './TraceTimeline';
import type { TraceData } from '@promptfoo/types';

describe('TraceTimeline', () => {
  let theme: Theme;

  beforeEach(() => {
    theme = createTheme();
  });

  const renderTraceTimeline = (trace: TraceData) => {
    return render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={trace} />
      </ThemeProvider>,
    );
  };

  // Timestamps in tests are in nanoseconds (1ms = 1e6 ns)
  const MS_TO_NS = 1e6;

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
          startTime: 100 * MS_TO_NS,
          endTime: 300 * MS_TO_NS,
        },
        {
          spanId: 'root-1',
          name: 'Parent Span',
          startTime: 0,
          endTime: 500 * MS_TO_NS,
        },
        {
          spanId: 'root-2',
          name: 'Another Root Span',
          startTime: 600 * MS_TO_NS,
          endTime: 800 * MS_TO_NS,
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
    // Use a real timestamp: 2023-03-15 12:00:00 UTC = 1678881600000 ms = 1678881600000000000 ns
    const baseTime = 1678881600000 * MS_TO_NS;
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
          endTime: baseTime + 1500 * MS_TO_NS, // 1.5 seconds later
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Duration appears in "Total Duration: X" and in the span bar
    // Use getAllByText and find the one in the timeline bar (has data-mui-internal-clone-element ancestor)
    const durationElements = screen.getAllByText('1.50s');
    const spanDurationLabel = durationElements.find((el) =>
      el.closest('[data-mui-internal-clone-element]'),
    );

    expect(spanDurationLabel).toBeDefined();
    await userEvent.hover(spanDurationLabel!.closest('[data-mui-internal-clone-element]')!);

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip).toHaveTextContent('Duration:');
    expect(tooltip).toHaveTextContent('Start:');
    expect(tooltip).toHaveTextContent('End:');

    expect(tooltip).toHaveTextContent('2023-03-15');
    expect(tooltip).toHaveTextContent('1.50s');
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
          endTime: 200 * MS_TO_NS,
        },
        {
          spanId: 'span-2',
          name: 'Span B',
          startTime: 0,
          endTime: 500 * MS_TO_NS,
        },
        {
          spanId: 'span-3',
          name: 'Span C',
          startTime: 0,
          endTime: 100 * MS_TO_NS,
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
          endTime: 200 * MS_TO_NS,
          name: 'span-1',
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-incomplete-data-123')).toBeInTheDocument();
  });

  it('should display span attributes in expanded details when span has attributes', async () => {
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
          endTime: 100 * MS_TO_NS,
          attributes: {
            'http.method': 'GET',
            'http.url': 'https://example.com',
          },
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Click the expand button to reveal attributes
    const expandButton = screen.getByTestId('ExpandMoreIcon').closest('button');
    expect(expandButton).toBeInTheDocument();
    await userEvent.click(expandButton!);

    // After expansion, attributes should be visible
    expect(await screen.findByText('Attributes')).toBeInTheDocument();
    expect(await screen.findByText('http.method')).toBeInTheDocument();
    expect(await screen.findByText('GET')).toBeInTheDocument();
    expect(await screen.findByText('http.url')).toBeInTheDocument();
    expect(await screen.findByText('https://example.com')).toBeInTheDocument();
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
          endTime: 500 * MS_TO_NS,
          statusCode: 2,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    // Use getAllByText since '500ms' appears in both the span duration and Total Duration
    const durationElements = screen.getAllByText('500ms');
    // Find the duration element that's in the span timeline (has data-mui-internal-clone-element ancestor)
    const typographyElement = durationElements.find((el) =>
      el.closest('[data-mui-internal-clone-element]'),
    );
    expect(typographyElement).toBeInTheDocument();
    expect(typographyElement).toHaveStyle(
      `color: ${theme.palette.getContrastText(theme.palette.error.main)}`,
    );
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
          endTime: 500 * MS_TO_NS,
          statusCode: 1,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    const timelineBar = screen.getByText('Success Span').closest('.MuiBox-root')
      ?.nextElementSibling?.firstChild;

    expect(timelineBar).toHaveStyle(`background-color: ${theme.palette.success.main}`);
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
          startTime: 200 * MS_TO_NS,
          endTime: 100 * MS_TO_NS,
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
          startTime: 100 * MS_TO_NS,
          endTime: 100 * MS_TO_NS,
        },
        {
          spanId: 'span-2',
          name: 'Span B',
          startTime: 100 * MS_TO_NS,
          endTime: 100 * MS_TO_NS,
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
          endTime: 200 * MS_TO_NS,
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
          endTime: 1000 * MS_TO_NS,
        },
        {
          spanId: 'extreme-span',
          name: 'Extreme Span',
          startTime: 10000000 * MS_TO_NS,
          endTime: 10001000 * MS_TO_NS,
        },
      ],
    };

    renderTraceTimeline(mockTrace);

    expect(screen.getByText('Trace ID: trace-extreme-time-diff')).toBeInTheDocument();
    expect(screen.getByText(/Total Duration:/)).toBeInTheDocument();
  });
});
