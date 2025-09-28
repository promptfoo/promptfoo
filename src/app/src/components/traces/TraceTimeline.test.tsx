import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { TraceData } from '@promptfoo/types';
import { createTheme, ThemeProvider } from '@mui/material/styles';

import TraceTimeline from './TraceTimeline';

const theme = createTheme();

describe('TraceTimeline', () => {
  it('should render the trace ID, total duration, and a timeline bar for each span when trace.spans contains valid span objects', () => {
    const mockTrace: TraceData = {
      traceId: 'test-trace-123',
      spans: [
        {
          spanId: 'span-1',
          parentSpanId: undefined,
          name: 'root-operation',
          startTime: 1000,
          endTime: 1800,
          attributes: { 'http.method': 'GET' },
          statusCode: 1,
        },
        {
          spanId: 'span-2',
          parentSpanId: 'span-1',
          name: 'child-db-query',
          startTime: 1200,
          endTime: 1500,
          attributes: { 'db.statement': 'SELECT * FROM users' },
          statusCode: 2,
        },
      ],
    };

    render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={mockTrace} />
      </ThemeProvider>,
    );

    expect(screen.getByText(`Trace ID: ${mockTrace.traceId}`)).toBeInTheDocument();

    expect(screen.getByText('Total Duration: 800ms')).toBeInTheDocument();

    expect(screen.getByText('root-operation')).toBeInTheDocument();
    expect(screen.getByText('child-db-query')).toBeInTheDocument();

    expect(screen.getByText('800ms')).toBeInTheDocument();
    expect(screen.getByText('300ms')).toBeInTheDocument();
  });

  it('should render the EmptyState component when trace.spans is an empty array', () => {
    const mockTrace: TraceData = {
      traceId: 'test-trace-123',
      spans: [],
    };

    render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={mockTrace} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No trace data available')).toBeInTheDocument();

    expect(
      screen.getByText('Trace timeline will appear here when spans are available'),
    ).toBeInTheDocument();

    expect(screen.getByTestId('TimelineIcon')).toBeInTheDocument();
  });

  it('should handle spans with missing endTime values', () => {
    const mockTrace: TraceData = {
      traceId: 'test-trace-456',
      spans: [
        {
          spanId: 'span-3',
          parentSpanId: undefined,
          name: 'operation-no-end',
          startTime: 2000,
          attributes: { 'custom.attribute': 'value' },
          statusCode: 0,
        },
      ],
    };

    render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={mockTrace} />
      </ThemeProvider>,
    );

    expect(screen.getByText(`Trace ID: ${mockTrace.traceId}`)).toBeInTheDocument();

    expect(screen.getByText('Total Duration: 0ms')).toBeInTheDocument();
    expect(screen.getByText('operation-no-end')).toBeInTheDocument();
    expect(screen.getByText('0ms')).toBeInTheDocument();
  });

  it('should handle circular parent-child relationships without crashing', () => {
    const mockTrace: TraceData = {
      traceId: 'circular-trace',
      spans: [
        {
          spanId: 'span-a',
          parentSpanId: 'span-b',
          name: 'Span A',
          startTime: 0,
          endTime: 100,
        },
        {
          spanId: 'span-b',
          parentSpanId: 'span-a',
          name: 'Span B',
          startTime: 50,
          endTime: 150,
        },
      ],
    };

    render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={mockTrace} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Trace ID: circular-trace')).toBeInTheDocument();
  });

  it('should handle spans where endTime is earlier than startTime', () => {
    const mockTrace: TraceData = {
      traceId: 'test-trace-123',
      spans: [
        {
          spanId: 'span-1',
          parentSpanId: undefined,
          name: 'root-operation',
          startTime: 1000,
          endTime: 800,
          attributes: { 'http.method': 'GET' },
          statusCode: 1,
        },
      ],
    };

    render(
      <ThemeProvider theme={theme}>
        <TraceTimeline trace={mockTrace} />
      </ThemeProvider>,
    );

    const traceIdElement = screen.getByText(`Trace ID: ${mockTrace.traceId}`);
    expect(traceIdElement).toBeInTheDocument();

    // Should show 0ms total duration (negative durations are clamped to 0)
    expect(screen.getByText('Total Duration: 0ms')).toBeInTheDocument();

    // Individual span should show 0ms duration (negative durations are clamped to 0)
    expect(screen.getByText('0ms')).toBeInTheDocument();
  });
});
