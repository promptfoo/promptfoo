import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ErrorBoundary } from 'react-error-boundary';
import TraceView, { type Trace } from '../../../components/traces/TraceView';

const subtitleTypographySx = {
  mb: 1,
  fontWeight: 500,
};

interface DebuggingPanelProps {
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  fetchTraces?: (evaluationId: string, signal: AbortSignal) => Promise<Trace[]>;
}

export function DebuggingPanel({
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  fetchTraces,
}: DebuggingPanelProps) {
  return (
    <Box>
      {evaluationId && (
        <Box mb={2}>
          <Typography variant="subtitle1" sx={subtitleTypographySx} aria-label="Trace Timeline">
            Trace Timeline
          </Typography>
          <ErrorBoundary fallback={<Alert severity="error">Error loading traces</Alert>}>
            <TraceView
              evaluationId={evaluationId}
              testCaseId={testCaseId}
              testIndex={testIndex}
              promptIndex={promptIndex}
              fetchTraces={fetchTraces}
            />
          </ErrorBoundary>
        </Box>
      )}
    </Box>
  );
}
