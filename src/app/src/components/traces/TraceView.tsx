import { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import TraceTimeline from './TraceTimeline';

interface TraceViewProps {
  evaluationId?: string;
  testCaseId?: string;
}

export default function TraceView({ evaluationId, testCaseId }: TraceViewProps) {
  const [traces, setTraces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTraces = async () => {
      if (!evaluationId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await callApi(`/traces/evaluation/${evaluationId}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setTraces(data.traces || []);
      } catch (err) {
        console.error('Error fetching traces:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch traces');
      } finally {
        setLoading(false);
      }
    };

    fetchTraces();
  }, [evaluationId]);

  if (!evaluationId) {
    return null;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
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

  // Filter traces by test case ID if provided
  const filteredTraces = testCaseId
    ? traces.filter((trace) => trace.testCaseId === testCaseId)
    : traces;

  if (filteredTraces.length === 0 && testCaseId) {
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
