import React from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Typography,
  Paper,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';
import AssessmentIcon from '@mui/icons-material/Assessment';

export interface EvalProgressData {
  current: number;
  total: number;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'error';
  message?: string;
  estimatedTimeRemaining?: number;
  currentProvider?: string;
  currentPrompt?: string;
  currentTest?: string;
}

interface EvalProgressBarProps {
  progress: EvalProgressData;
  onCancel?: () => void;
}

export const EvalProgressBar: React.FC<EvalProgressBarProps> = ({ progress, onCancel }) => {
  const theme = useTheme();
  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const getStatusColor = () => {
    switch (progress.status) {
      case 'complete':
        return theme.palette.success.main;
      case 'failed':
      case 'error':
        return theme.palette.error.main;
      case 'running':
        return theme.palette.primary.main;
      default:
        return theme.palette.action.disabled;
    }
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) {
      return '';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Paper
      elevation={2}
      sx={{
        p: 3,
        mb: 3,
        backgroundColor: alpha(theme.palette.background.paper, 0.98),
        border: '1px solid',
        borderColor: alpha(getStatusColor(), 0.3),
      }}
    >
      <Stack spacing={2}>
        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <AssessmentIcon color="primary" />
            <Typography variant="h6" fontWeight={500}>
              Running evaluation
            </Typography>
          </Stack>
          {progress.estimatedTimeRemaining && progress.status === 'running' && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <TimerIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                ~{formatTime(progress.estimatedTimeRemaining)} remaining
              </Typography>
            </Stack>
          )}
        </Box>

        {/* Progress bar */}
        <Box>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="body2" color="text.secondary">
              {progress.message || `Processing test ${progress.current} of ${progress.total}`}
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              {progressPercent.toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 8,
              borderRadius: 1,
              backgroundColor: alpha(getStatusColor(), 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 1,
                backgroundColor: getStatusColor(),
              },
            }}
          />
        </Box>

        {/* Current operation details */}
        {progress.status === 'running' && (
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.1),
            }}
          >
            <Stack spacing={0.5}>
              {progress.currentProvider && (
                <Typography variant="caption" color="text.secondary">
                  <strong>Provider:</strong> {progress.currentProvider}
                </Typography>
              )}
              {progress.currentPrompt && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  <strong>Prompt:</strong> {progress.currentPrompt}
                </Typography>
              )}
              {progress.currentTest && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  <strong>Test case:</strong> {progress.currentTest}
                </Typography>
              )}
            </Stack>
          </Box>
        )}

        {/* Status message */}
        {progress.status === 'complete' && (
          <Box display="flex" alignItems="center" gap={1}>
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography variant="body2" color="success.main">
              Evaluation completed successfully!
            </Typography>
          </Box>
        )}

        {(progress.status === 'failed' || progress.status === 'error') && (
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" color="error">
              {progress.message || 'Evaluation failed. Check the logs for details.'}
            </Typography>
          </Box>
        )}

        {/* Cancel button */}
        {onCancel && progress.status === 'running' && (
          <Box display="flex" justifyContent="flex-end">
            <Button
              variant="outlined"
              size="small"
              onClick={onCancel}
              color="inherit"
              sx={{ textTransform: 'none' }}
            >
              Cancel evaluation
            </Button>
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

export default EvalProgressBar;
