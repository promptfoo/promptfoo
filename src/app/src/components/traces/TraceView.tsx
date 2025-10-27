import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TraceTimeline from './TraceTimeline';

export interface Trace {
  traceId: string;
  testCaseId?: string | number;
  spans?: any[];
}

interface TraceViewProps {
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  traces?: Trace[];
}

export default function TraceView({
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  traces = [],
}: TraceViewProps) {
  if (!evaluationId) {
    return null;
  }

  if (traces.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No traces available for this evaluation
        </Typography>
      </Box>
    );
  }

  // Filter traces with try-direct-match then fallback approach
  const isComposedId = (id: unknown): id is string =>
    typeof id === 'string' && /^\d+-\d+$/.test(id);

  const matchesIndices = (id: unknown, ti?: number, pi?: number) => {
    if (!isComposedId(id) || ti === undefined || pi === undefined) {
      return false;
    }
    const [a, b] = id.split('-');
    return Number.parseInt(a, 10) === ti && Number.parseInt(b, 10) === pi;
  };

  let filteredTraces: any[] = traces;

  if (traces.length > 0) {
    if (testCaseId) {
      // Try direct testCaseId match first
      const directMatches = traces.filter((trace) => trace.testCaseId === testCaseId);

      if (directMatches.length > 0) {
        filteredTraces = directMatches;
      } else if (testIndex !== undefined && promptIndex !== undefined) {
        // Fallback: try index-based matching on composed trace.testCaseId
        filteredTraces = traces.filter((trace) =>
          matchesIndices(trace.testCaseId, testIndex, promptIndex),
        );
      } else {
        // No direct match and no indices for fallback
        filteredTraces = [];
      }
    } else if (testIndex !== undefined && promptIndex !== undefined) {
      // No testCaseId but indices provided - try index-based filtering
      filteredTraces = traces.filter((trace) =>
        matchesIndices(trace.testCaseId, testIndex, promptIndex),
      );
    }
    // If no testCaseId and no indices, show all traces for the evaluation
  }

  if (filteredTraces.length === 0 && (testCaseId || testIndex !== undefined)) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No traces available for this test case
        </Typography>
      </Box>
    );
  }

  // If we have traces but no spans, show a helpful message
  const hasAnySpans = filteredTraces.some((trace) => trace.spans && trace.spans.length > 0);

  if (!hasAnySpans) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Traces were created but no spans were received. Make sure your provider is:
          <ul style={{ marginTop: 8 }}>
            <li>Configured to send traces to the OTLP endpoint (http://localhost:4318)</li>
            <li>Creating spans within the trace context</li>
            <li>Properly exporting spans before the evaluation completes</li>
          </ul>
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {filteredTraces.map((trace, index) => (
        <Box
          key={`trace-${trace.traceId}-${index}`}
          sx={{ mb: index < filteredTraces.length - 1 ? 3 : 0 }}
        >
          <TraceTimeline trace={trace} />
        </Box>
      ))}
    </Box>
  );
}
