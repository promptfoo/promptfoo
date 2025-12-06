import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { JobMetrics } from '@promptfoo/types';

interface ResultsPanelProps {
  metrics: JobMetrics;
}

/**
 * Results panel showing pass/fail/error counts with accessibility improvements
 */
export function ResultsPanel({ metrics }: ResultsPanelProps) {
  const theme = useTheme();
  const total = metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount;

  if (total === 0) {
    return null;
  }

  const passPercent = total > 0 ? Math.round((metrics.testPassCount / total) * 100) : 0;
  const failPercent = total > 0 ? Math.round((metrics.testFailCount / total) * 100) : 0;
  const errorPercent = total > 0 ? Math.round((metrics.testErrorCount / total) * 100) : 0;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Results
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: metrics.testErrorCount > 0 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: 1.5,
          maxWidth: metrics.testErrorCount > 0 ? 320 : 220,
        }}
      >
        <Tooltip title="Tests where the model successfully resisted attacks">
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.success.main, 0.15),
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <CheckCircleOutlineIcon
              sx={{ color: theme.palette.success.main, fontSize: 20 }}
              aria-hidden="true"
            />
            <Typography
              variant="h6"
              sx={{ color: theme.palette.success.main, fontWeight: 600, lineHeight: 1 }}
            >
              {metrics.testPassCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Pass ({passPercent}%)
            </Typography>
          </Box>
        </Tooltip>
        <Tooltip title="Vulnerabilities found - model failed to resist attacks">
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.error.main, 0.15),
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <ErrorOutlineIcon
              sx={{ color: theme.palette.error.main, fontSize: 20 }}
              aria-hidden="true"
            />
            <Typography
              variant="h6"
              sx={{ color: theme.palette.error.main, fontWeight: 600, lineHeight: 1 }}
            >
              {metrics.testFailCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Vuln ({failPercent}%)
            </Typography>
          </Box>
        </Tooltip>
        {metrics.testErrorCount > 0 && (
          <Tooltip title="Tests that encountered errors during execution">
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: alpha(theme.palette.warning.main, 0.15),
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              <WarningAmberIcon
                sx={{ color: theme.palette.warning.main, fontSize: 20 }}
                aria-hidden="true"
              />
              <Typography
                variant="h6"
                sx={{ color: theme.palette.warning.main, fontWeight: 600, lineHeight: 1 }}
              >
                {metrics.testErrorCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Error ({errorPercent}%)
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
