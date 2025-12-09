import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { JobMetrics } from '@promptfoo/types';
import { formatNumber } from './utils';

interface ResourcesPanelProps {
  metrics: JobMetrics;
}

/**
 * Resources panel showing token usage and latency
 */
export function ResourcesPanel({ metrics }: ResourcesPanelProps) {
  const theme = useTheme();
  const { tokenUsage, totalLatencyMs } = metrics;

  if (tokenUsage.numRequests === 0) {
    return null;
  }

  const avgLatency = tokenUsage.numRequests > 0 ? totalLatencyMs / tokenUsage.numRequests : 0;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
        Resources
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          p: 1,
          borderRadius: 1,
          backgroundColor: theme.palette.action.hover,
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary">
            Requests
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            {tokenUsage.numRequests}
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box>
          <Typography variant="caption" color="text.secondary">
            Tokens
          </Typography>
          <Typography variant="body2" fontWeight={500}>
            {formatNumber(tokenUsage.total)}
          </Typography>
        </Box>
        {avgLatency > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Avg Latency
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {(avgLatency / 1000).toFixed(1)}s
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
