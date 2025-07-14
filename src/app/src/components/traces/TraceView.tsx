import React, { useState, useEffect } from 'react';
import { callApi } from '@app/utils/api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import TraceTimeline from './TraceTimeline';

interface TraceViewProps {
  evaluationId?: string;
  testCaseId?: string;
  onContentChange?: (hasContent: boolean) => void;
}

export default function TraceView({ evaluationId, testCaseId, onContentChange }: TraceViewProps) {
  const [traces, setTraces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTraces = async () => {
      if (!evaluationId) {
        setLoading(false);
        onContentChange?.(false);
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
        const fetchedTraces = data.traces || [];
        setTraces(fetchedTraces);
        
        // Check if we have meaningful content to display (traces with spans)
        const hasAnySpans = fetchedTraces.some((trace: any) => trace.spans && trace.spans.length > 0);
        onContentChange?.(hasAnySpans);
      } catch (err) {
        console.error('Error fetching traces:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch traces');
        onContentChange?.(false);
      } finally {
        setLoading(false);
      }
    };

    fetchTraces();
  }, [evaluationId, onContentChange]);

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
    return null;
  }

  // Filter traces by test case ID if provided
  const filteredTraces = testCaseId
    ? traces.filter((trace) => trace.testCaseId === testCaseId)
    : traces;

  if (filteredTraces.length === 0 && testCaseId) {
    return null;
  }

  // If we have traces but no spans, show a helpful message
  const hasAnySpans = filteredTraces.some((trace) => trace.spans && trace.spans.length > 0);

  if (!hasAnySpans) {
    return null;
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
