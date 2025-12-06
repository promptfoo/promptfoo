import React, { useEffect, useMemo, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type {
  JobError,
  JobMetrics,
  JobCompletionSummary,
  VulnerabilityFoundEvent,
  VulnerabilitySeverityCounts,
} from '@promptfoo/types';

import VulnerabilityStream from '../VulnerabilityStream';
import { CompletionSummary } from './CompletionSummary';
import { ErrorsPanel } from './ErrorsPanel';
import { ResourcesPanel } from './ResourcesPanel';
import { ResultsPanel } from './ResultsPanel';
import { formatElapsedTime, estimateTimeRemaining } from './utils';

export interface ExecutionProgressProps {
  progress: number;
  total: number;
  status: 'idle' | 'in-progress' | 'complete' | 'error';
  startedAt: number | null;
  logs: string[];
  logsExpanded: boolean;
  onToggleLogs: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  children?: React.ReactNode; // LogViewer component
  // Enhanced fields from Job interface
  phase?: 'initializing' | 'generating' | 'evaluating' | 'complete' | 'error';
  phaseDetail?: string;
  metrics?: JobMetrics;
  errors?: JobError[];
  summary?: JobCompletionSummary;
  evalId?: string | null;
  // Live vulnerability stream
  vulnerabilities?: VulnerabilityFoundEvent[];
  severityCounts?: VulnerabilitySeverityCounts;
}

export function ExecutionProgress({
  progress,
  total,
  status,
  startedAt,
  logs,
  logsExpanded,
  onToggleLogs,
  onCancel,
  onRetry,
  children,
  phase,
  phaseDetail,
  metrics,
  errors,
  summary,
  evalId,
  vulnerabilities,
  severityCounts,
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

  // Use phaseDetail if available, otherwise fall back to default status text
  const statusText = useMemo(() => {
    if (phaseDetail) {
      return phaseDetail;
    }
    switch (status) {
      case 'idle':
        return 'Ready to run';
      case 'in-progress':
        if (phase === 'generating') {
          return 'Generating test cases...';
        }
        if (phase === 'evaluating' && total > 0) {
          return `Evaluating ${progress}/${total}...`;
        }
        return 'Initializing...';
      case 'complete':
        return 'Evaluation complete';
      case 'error':
        return 'Evaluation failed';
      default:
        return '';
    }
  }, [status, phase, phaseDetail, progress, total]);

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

  // Determine if we should show indeterminate progress
  const showIndeterminate = status === 'in-progress' && (phase === 'generating' || total === 0);

  if (status === 'idle') {
    return null;
  }

  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        mb: 2,
        maxWidth: 600,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {/* Header with status and elapsed time */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {status === 'complete' && (
            <Tooltip title="Evaluation completed successfully">
              <CheckCircleIcon sx={{ color: theme.palette.success.main }} aria-label="Success" />
            </Tooltip>
          )}
          {status === 'error' && (
            <Tooltip title="Evaluation failed">
              <ErrorIcon sx={{ color: theme.palette.error.main }} aria-label="Error" />
            </Tooltip>
          )}
          {status === 'in-progress' && (
            <Tooltip title="Evaluation in progress">
              <PlayArrowIcon sx={{ color: theme.palette.primary.main }} aria-label="Running" />
            </Tooltip>
          )}
          <Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 500,
                color: getStatusColor(),
              }}
            >
              {statusText}
            </Typography>
            {phase && status === 'in-progress' && (
              <Chip
                label={phase}
                size="small"
                sx={{
                  mt: 0.5,
                  textTransform: 'capitalize',
                  backgroundColor: alpha(theme.palette.primary.main, 0.2),
                }}
              />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Time display with ETA */}
          {elapsedTime !== null && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" color="text.secondary">
                {formatElapsedTime(elapsedTime)}
              </Typography>
              {status === 'in-progress' && progress > 0 && total > 0 && elapsedTime > 0 && (
                <Typography variant="caption" color="text.secondary">
                  ~{estimateTimeRemaining(progress, total, elapsedTime)} remaining
                </Typography>
              )}
            </Box>
          )}
          {/* Action buttons */}
          {status === 'in-progress' && onCancel && (
            <Tooltip title="Cancel evaluation">
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={onCancel}
                startIcon={<StopIcon />}
                sx={{ minWidth: 'auto' }}
              >
                Cancel
              </Button>
            </Tooltip>
          )}
          {status === 'error' && onRetry && (
            <Tooltip title="Retry evaluation">
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={onRetry}
                startIcon={<RefreshIcon />}
              >
                Retry
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Progress bar */}
      <Box sx={{ mb: 2 }}>
        <LinearProgress
          variant={showIndeterminate ? 'indeterminate' : 'determinate'}
          value={progressPercent}
          color={getProgressBarColor()}
          sx={{
            height: 8,
            borderRadius: 1,
            backgroundColor: theme.palette.action.hover,
          }}
        />
        {!showIndeterminate && total > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'right', mt: 0.5 }}
          >
            {progress}/{total} ({progressPercent}%)
          </Typography>
        )}
      </Box>

      {/* Results panel */}
      {metrics &&
        (metrics.testPassCount > 0 || metrics.testFailCount > 0 || metrics.testErrorCount > 0) && (
          <ResultsPanel metrics={metrics} />
        )}

      {/* Live vulnerability stream */}
      {vulnerabilities && severityCounts && (
        <VulnerabilityStream
          vulnerabilities={vulnerabilities}
          severityCounts={severityCounts}
          sx={{ mt: 2, maxHeight: 400 }}
        />
      )}

      {/* Completion summary */}
      {status === 'complete' && summary && (
        <CompletionSummary summary={summary} evalId={evalId ?? null} />
      )}

      {/* Resources panel */}
      {metrics && metrics.tokenUsage.numRequests > 0 && <ResourcesPanel metrics={metrics} />}

      {/* Errors panel */}
      {errors && errors.length > 0 && <ErrorsPanel errors={errors} />}

      {/* Logs toggle */}
      {logs.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Box
            onClick={onToggleLogs}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleLogs();
              }
            }}
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
            <Box
              component="span"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 0.5,
                mr: 0.5,
                transform: logsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
              aria-hidden="true"
            >
              <ExpandMoreIcon fontSize="small" />
            </Box>
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
