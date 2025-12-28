import { useMemo, useState } from 'react';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { TraceData, TraceSpan } from '@promptfoo/types';

// Use TraceSpan from base types
type SpanData = TraceSpan;

interface TraceTimelineProps {
  trace: TraceData;
}

interface ProcessedSpan extends SpanData {
  duration: number;
  relativeStart: number;
  depth: number;
  children: ProcessedSpan[];
}

const getSpanStatus = (statusCode?: number): { color: string; label: string } => {
  // From SpanStatusCode in @opentelemetry/api
  if (statusCode === 1) {
    return { color: 'success', label: 'OK' };
  } else if (statusCode === 2) {
    return { color: 'error', label: 'ERROR' };
  }
  return { color: 'default', label: 'UNSET' };
};

// Duration values are stored in milliseconds (both LocalSpanExporter and OTLPReceiver
// convert to milliseconds before storing in the database)
const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1) {
    return `<1ms`;
  } else if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  } else {
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }
};

// Timestamps are stored in milliseconds (Unix epoch ms)
const formatTimestamp = (ms: number): string => {
  const date = new Date(ms);
  return date.toISOString();
};

export default function TraceTimeline({ trace }: TraceTimelineProps) {
  const theme = useTheme();
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  };

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
        Total Duration: {formatDuration(totalDuration)}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, overflow: 'auto' }}>
        {spans.map((span, index) => {
          const status = getSpanStatus(span.statusCode);
          const isExpanded = expandedSpans.has(span.spanId);
          const hasAttributes = span.attributes && Object.keys(span.attributes).length > 0;

          // Original temporal timeline approach - both position AND width based on time
          const spanDurationPercent = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 0;
          const spanStartPercent =
            totalDuration > 0 ? (span.relativeStart / totalDuration) * 100 : 0;

          return (
            <Box key={`${span.spanId}-${index}`} sx={{ mb: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: 40,
                  position: 'relative',
                }}
              >
                {/* Expand/collapse button */}
                <IconButton
                  size="small"
                  onClick={() => toggleSpan(span.spanId)}
                  sx={{
                    mr: 0.5,
                    visibility: hasAttributes ? 'visible' : 'hidden',
                  }}
                >
                  {isExpanded ? (
                    <ExpandLessIcon fontSize="small" />
                  ) : (
                    <ExpandMoreIcon fontSize="small" />
                  )}
                </IconButton>

                {/* Span name with indentation */}
                <Box
                  sx={{
                    width: '28%',
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
                          Duration: {formatDuration(span.duration)}
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
                        {hasAttributes && (
                          <>
                            <br />
                            <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                              Click expand to view attributes
                            </Typography>
                          </>
                        )}
                      </Box>
                    }
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        left: `${spanStartPercent}%`,
                        width: `${Math.max(spanDurationPercent, 0.5)}%`, // Minimum width for visibility
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
                        cursor: hasAttributes ? 'pointer' : 'default',
                      }}
                      onClick={() => hasAttributes && toggleSpan(span.spanId)}
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
                        {formatDuration(span.duration)}
                      </Typography>
                    </Box>
                  </Tooltip>
                </Box>
              </Box>

              {/* Expandable attributes panel */}
              <Collapse in={isExpanded}>
                <Box
                  sx={{
                    ml: 5,
                    mt: 1,
                    mb: 2,
                    p: 2,
                    backgroundColor: theme.palette.action.hover,
                    borderRadius: 1,
                    borderLeft: `3px solid ${theme.palette.primary.main}`,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Span Details
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Span ID
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {span.spanId}
                      </Typography>
                    </Box>
                    {span.parentSpanId && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Parent Span ID
                        </Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {span.parentSpanId}
                        </Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Start Time
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {formatTimestamp(span.startTime)}
                      </Typography>
                    </Box>
                    {span.endTime && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          End Time
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: 12 }}>
                          {formatTimestamp(span.endTime)}
                        </Typography>
                      </Box>
                    )}
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Duration
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {formatDuration(span.duration)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Status
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: 12,
                          color:
                            status.color === 'error'
                              ? theme.palette.error.main
                              : status.color === 'success'
                                ? theme.palette.success.main
                                : 'inherit',
                        }}
                      >
                        {status.label}
                      </Typography>
                    </Box>
                  </Box>

                  {hasAttributes && (
                    <>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                        Attributes
                      </Typography>
                      <Box
                        sx={{
                          backgroundColor: theme.palette.background.paper,
                          borderRadius: 1,
                          p: 1,
                          maxHeight: 300,
                          overflow: 'auto',
                        }}
                      >
                        {Object.entries(span.attributes!).map(([key, value]) => (
                          <Box
                            key={key}
                            sx={{
                              display: 'flex',
                              gap: 1,
                              py: 0.5,
                              borderBottom: `1px solid ${theme.palette.divider}`,
                              '&:last-child': { borderBottom: 'none' },
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: 11,
                                color: theme.palette.primary.main,
                                minWidth: 200,
                                wordBreak: 'break-all',
                              }}
                            >
                              {key}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: 11,
                                wordBreak: 'break-all',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </>
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
