import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface SpanData {
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  startTime: number;
  endTime?: number | null;
  attributes?: Record<string, any> | null;
  statusCode?: number | null;
  statusMessage?: string | null;
}

interface TraceData {
  traceId: string;
  spans: SpanData[];
}

interface TraceTimelineProps {
  trace: TraceData;
}

interface ProcessedSpan extends SpanData {
  duration: number;
  relativeStart: number;
  depth: number;
  children: ProcessedSpan[];
}

const getSpanStatus = (statusCode?: number | null): { color: string; label: string } => {
  // From SpanStatusCode in @opentelemetry/api
  if (statusCode === 1) {
    return { color: 'success', label: 'OK' };
  } else if (statusCode === 2) {
    return { color: 'error', label: 'ERROR' };
  }
  return { color: 'default', label: 'UNSET' };
};

const formatDuration = (microseconds: number): string => {
  const milliseconds = microseconds / 1000;
  if (milliseconds < 1) {
    return `${Math.round(milliseconds)}ms`;
  } else if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  } else {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }
};

const formatTimestamp = (millis: number): string => {
  const date = new Date(millis); // Timestamps are already in milliseconds
  return date.toISOString();
};

export default function TraceTimeline({ trace }: TraceTimelineProps) {
  const theme = useTheme();

  const processedSpans = useMemo(() => {
    if (!trace.spans || trace.spans.length === 0) {
      return { spans: [], minTime: 0, maxTime: 0, totalDuration: 0 };
    }

    // Sort spans by start time
    const sortedSpans = [...trace.spans].sort((a, b) => a.startTime - b.startTime);

    // Find min and max times
    const minTime = sortedSpans[0].startTime;
    const maxTime = sortedSpans.reduce((max, span) => {
      const spanEnd = span.endTime || span.startTime;
      return spanEnd > max ? spanEnd : max;
    }, minTime);

    const totalDuration = maxTime - minTime;

    // Build span hierarchy
    const spanMap = new Map<string, ProcessedSpan>();
    const rootSpans: ProcessedSpan[] = [];

    // First pass: create all spans
    sortedSpans.forEach((span) => {
      const duration = span.endTime ? span.endTime - span.startTime : 0;
      const processedSpan: ProcessedSpan = {
        ...span,
        duration,
        relativeStart: span.startTime - minTime,
        depth: 0,
        children: [],
      };
      spanMap.set(span.spanId, processedSpan);
    });

    // Second pass: build hierarchy
    spanMap.forEach((span) => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        const parent = spanMap.get(span.parentSpanId)!;
        parent.children.push(span);
      } else {
        rootSpans.push(span);
      }
    });

    // Calculate depths
    const calculateDepth = (span: ProcessedSpan, depth: number) => {
      span.depth = depth;
      span.children.forEach((child) => calculateDepth(child, depth + 1));
    };

    rootSpans.forEach((span) => calculateDepth(span, 0));

    // Flatten spans for rendering
    const flattenSpans = (spans: ProcessedSpan[]): ProcessedSpan[] => {
      const result: ProcessedSpan[] = [];
      const addSpan = (span: ProcessedSpan) => {
        result.push(span);
        span.children.forEach(addSpan);
      };
      spans.forEach(addSpan);
      return result;
    };

    return {
      spans: flattenSpans(rootSpans),
      minTime,
      maxTime,
      totalDuration,
    };
  }, [trace]);

  if (!trace.spans || trace.spans.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No trace data available
        </Typography>
      </Box>
    );
  }

  const { spans, totalDuration } = processedSpans;

  return (
    <Box pt={2}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Trace ID: {trace.traceId}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Total Duration: {formatDuration(totalDuration * 1000)}{' '}
        {/* Convert milliseconds to microseconds */}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, overflow: 'auto' }}>
        {spans.map((span, index) => {
          const status = getSpanStatus(span.statusCode);
          const spanDurationPercent = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 0;
          const spanStartPercent =
            totalDuration > 0 ? (span.relativeStart / totalDuration) * 100 : 0;

          return (
            <Box
              key={`${span.spanId}-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 1,
                minHeight: 40,
                position: 'relative',
              }}
            >
              {/* Span name with indentation */}
              <Box
                sx={{
                  width: '30%',
                  pr: 2,
                  pl: span.depth * 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <Tooltip title={span.name}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {span.name}
                  </Typography>
                </Tooltip>
              </Box>

              {/* Timeline bar */}
              <Box
                sx={{
                  flex: 1,
                  position: 'relative',
                  height: 24,
                  backgroundColor: theme.palette.action.hover,
                  borderRadius: 1,
                }}
              >
                <Tooltip
                  title={
                    <Box>
                      <Typography variant="caption">
                        Duration: {formatDuration(span.duration * 1000)}
                      </Typography>
                      <br />
                      <Typography variant="caption">
                        Start: {formatTimestamp(span.startTime)}
                      </Typography>
                      {span.endTime && (
                        <>
                          <br />
                          <Typography variant="caption">
                            End: {formatTimestamp(span.endTime)}
                          </Typography>
                        </>
                      )}
                      {span.attributes && Object.keys(span.attributes).length > 0 && (
                        <>
                          <br />
                          <Typography variant="caption">Attributes:</Typography>
                          {Object.entries(span.attributes).map(([key, value]) => (
                            <Typography
                              key={key}
                              variant="caption"
                              sx={{ display: 'block', ml: 1 }}
                            >
                              {key}: {JSON.stringify(value)}
                            </Typography>
                          ))}
                        </>
                      )}
                    </Box>
                  }
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: `${spanStartPercent}%`,
                      width: `${Math.max(spanDurationPercent, 0.5)}%`,
                      height: '100%',
                      backgroundColor:
                        status.color === 'error'
                          ? theme.palette.error.main
                          : status.color === 'success'
                            ? theme.palette.success.main
                            : theme.palette.primary.main,
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      px: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: theme.palette.getContrastText(
                          status.color === 'error'
                            ? theme.palette.error.main
                            : status.color === 'success'
                              ? theme.palette.success.main
                              : theme.palette.primary.main,
                        ),
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {formatDuration(span.duration * 1000)}
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
