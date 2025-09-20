import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ErrorBoundary } from 'react-error-boundary';
import TraceView from '../../../components/traces/TraceView';

const subtitleTypographySx = {
  mb: 1,
  fontWeight: 500,
};

interface DebuggingPanelProps {
  evaluationId?: string;
  testCaseId?: string;
  testIndex?: number;
  promptIndex?: number;
  showTraceSection: boolean;
  onTraceSectionVisibilityChange: (visible: boolean) => void;
}

export function DebuggingPanel({
  evaluationId,
  testCaseId,
  testIndex,
  promptIndex,
  showTraceSection,
  onTraceSectionVisibilityChange,
}: DebuggingPanelProps) {
  return (
    <Box>
      {evaluationId && (
        <Box mb={2} sx={{ display: showTraceSection ? 'block' : 'none' }}>
          <Typography variant="subtitle1" sx={subtitleTypographySx}>
            Trace Timeline
          </Typography>
          <ErrorBoundary fallback={<Alert severity="error">Error loading traces</Alert>}>
            <TraceView
              evaluationId={evaluationId}
              testCaseId={testCaseId}
              testIndex={testIndex}
              promptIndex={promptIndex}
              onVisibilityChange={onTraceSectionVisibilityChange}
            />
          </ErrorBoundary>
        </Box>
      )}
    </Box>
  );
}
