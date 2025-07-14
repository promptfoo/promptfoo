import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ErrorBoundary } from 'react-error-boundary';
import Alert from '@mui/material/Alert';
import TraceView from './TraceView';

interface TraceSectionProps {
  evaluationId?: string;
  testCaseId?: string;
}

const subtitleTypographySx = {
  mb: 1,
  fontWeight: 500,
};

export default function TraceSection({ evaluationId, testCaseId }: TraceSectionProps) {
  const [hasContent, setHasContent] = React.useState(false);

  // TraceView will handle its own data fetching and call this callback
  // to let us know if it has content to display
  const handleContentChange = React.useCallback((hasTraces: boolean) => {
    setHasContent(hasTraces);
  }, []);

  if (!evaluationId) {
    return null;
  }

  return (
    <Box
      mt={2}
      sx={{
        display: hasContent ? 'block' : 'none',
      }}
    >
      <Typography variant="subtitle1" sx={subtitleTypographySx}>
        Trace Timeline
      </Typography>
      <ErrorBoundary fallback={<Alert severity="error">Error loading traces</Alert>}>
        <TraceView
          evaluationId={evaluationId}
          testCaseId={testCaseId}
          onContentChange={handleContentChange}
        />
      </ErrorBoundary>
    </Box>
  );
}
