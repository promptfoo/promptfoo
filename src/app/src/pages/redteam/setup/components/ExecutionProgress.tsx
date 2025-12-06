import React, { useEffect, useMemo, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

interface ExecutionProgressProps {
  progress: number;
  total: number;
  status: 'idle' | 'in-progress' | 'complete' | 'error';
  startedAt: number | null;
  logs: string[];
  logsExpanded: boolean;
  onToggleLogs: () => void;
  children?: React.ReactNode; // LogViewer component
}

function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function ExecutionProgress({
  progress,
  total,
  status,
  startedAt,
  logs,
  logsExpanded,
  onToggleLogs,
  children,
}: ExecutionProgressProps) {
  const theme = useTheme();

  const progressPercent = useMemo(() => {
    if (total === 0) {
      return 0;
    }
    return Math.min(Math.round((progress / total) * 100), 100);
  }, [progress, total]);

  // Elapsed time needs to update every second while job is running
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);

  useEffect(() => {
    // Reset elapsed time when idle
    if (status === 'idle') {
      setElapsedTime(null);
      return;
    }

    // When job completes/errors, freeze the elapsed time at final value
    if (status === 'complete' || status === 'error') {
      if (startedAt) {
        setElapsedTime(Date.now() - startedAt);
      }
      return;
    }

    // Only run timer while in-progress with valid startedAt
    if (status !== 'in-progress' || !startedAt) {
      return;
    }

    // Set initial elapsed time
    setElapsedTime(Date.now() - startedAt);

    // Update every second
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startedAt);
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startedAt]);

  const statusText = useMemo(() => {
    switch (status) {
      case 'idle':
        return 'Ready to run';
      case 'in-progress':
        if (total > 0) {
          return `Running probes... ${progress}/${total}`;
        }
        return 'Initializing...';
      case 'complete':
        return 'Evaluation complete';
      case 'error':
        return 'Evaluation failed';
      default:
        return '';
    }
  }, [status, progress, total]);

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return theme.palette.success.main;
      case 'error':
        return theme.palette.error.main;
      case 'in-progress':
        return theme.palette.primary.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  const getProgressBarColor = (): 'primary' | 'success' | 'error' => {
    switch (status) {
      case 'complete':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'primary';
    }
  };

  if (status === 'idle') {
    return null;
  }

  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        mb: 2,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {/* Header with status and elapsed time */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {status === 'complete' && <CheckCircleIcon sx={{ color: theme.palette.success.main }} />}
          {status === 'error' && <ErrorIcon sx={{ color: theme.palette.error.main }} />}
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: getStatusColor(),
            }}
          >
            {statusText}
          </Typography>
        </Box>
        {elapsedTime !== null && (
          <Typography variant="body2" color="text.secondary">
            Elapsed: {formatElapsedTime(elapsedTime)}
          </Typography>
        )}
      </Box>

      {/* Progress bar */}
      <Box sx={{ mb: 1.5 }}>
        <LinearProgress
          variant={status === 'in-progress' && total === 0 ? 'indeterminate' : 'determinate'}
          value={progressPercent}
          color={getProgressBarColor()}
          sx={{
            height: 8,
            borderRadius: 1,
            backgroundColor: theme.palette.action.hover,
          }}
        />
        {total > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}
          >
            {progressPercent}%
          </Typography>
        )}
      </Box>

      {/* Logs toggle */}
      {logs.length > 0 && (
        <>
          <Box
            onClick={onToggleLogs}
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              py: 1,
              px: 0.5,
              mx: -0.5,
              borderRadius: 1,
              '&:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <IconButton
              size="small"
              sx={{
                p: 0.5,
                mr: 0.5,
                transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" color="text.secondary">
              {logsExpanded ? 'Hide logs' : 'Show logs'} ({logs.length} lines)
            </Typography>
          </Box>

          <Collapse in={logsExpanded}>
            <Box sx={{ mt: 1 }}>{children}</Box>
          </Collapse>
        </>
      )}
    </Paper>
  );
}
