import React, { useEffect, useMemo, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningIcon from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import type {
  JobError,
  JobMetrics,
  JobGenerationSummary,
  JobCompletionSummary,
} from '@promptfoo/types';

interface ExecutionProgressProps {
  progress: number;
  total: number;
  status: 'idle' | 'in-progress' | 'complete' | 'error';
  startedAt: number | null;
  logs: string[];
  logsExpanded: boolean;
  onToggleLogs: () => void;
  children?: React.ReactNode; // LogViewer component
  // Enhanced fields from Job interface
  phase?: 'initializing' | 'generating' | 'evaluating' | 'complete' | 'error';
  phaseDetail?: string;
  metrics?: JobMetrics;
  errors?: JobError[];
  generation?: JobGenerationSummary;
  summary?: JobCompletionSummary;
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

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}

/**
 * Results panel showing pass/fail/error counts
 */
function ResultsPanel({ metrics }: { metrics: JobMetrics }) {
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
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 80,
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.palette.success.main + '15',
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" sx={{ color: theme.palette.success.main, fontWeight: 600 }}>
            {metrics.testPassCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Pass ({passPercent}%)
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 80,
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.palette.error.main + '15',
            textAlign: 'center',
          }}
        >
          <Typography variant="h5" sx={{ color: theme.palette.error.main, fontWeight: 600 }}>
            {metrics.testFailCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Fail ({failPercent}%)
          </Typography>
        </Box>
        {metrics.testErrorCount > 0 && (
          <Box
            sx={{
              flex: 1,
              minWidth: 80,
              p: 1.5,
              borderRadius: 1,
              backgroundColor: theme.palette.warning.main + '15',
              textAlign: 'center',
            }}
          >
            <Typography variant="h5" sx={{ color: theme.palette.warning.main, fontWeight: 600 }}>
              {metrics.testErrorCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Error ({errorPercent}%)
            </Typography>
          </Box>
        )}
      </Box>
      {metrics.testFailCount > 0 && (
        <Typography variant="body2" sx={{ mt: 1, color: theme.palette.error.main }}>
          {metrics.testFailCount} vulnerabilities found
        </Typography>
      )}
    </Box>
  );
}

/**
 * Resources panel showing token usage
 */
function ResourcesPanel({ metrics }: { metrics: JobMetrics }) {
  const theme = useTheme();
  const { tokenUsage, totalLatencyMs } = metrics;

  if (tokenUsage.numRequests === 0) {
    return null;
  }

  const avgLatency = tokenUsage.numRequests > 0 ? totalLatencyMs / tokenUsage.numRequests : 0;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Resources
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          p: 1.5,
          borderRadius: 1,
          backgroundColor: theme.palette.action.hover,
        }}
      >
        <Box>
          <Typography variant="body2" color="text.secondary">
            Requests
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {tokenUsage.numRequests}
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        <Box>
          <Typography variant="body2" color="text.secondary">
            Tokens
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {formatNumber(tokenUsage.total)}
          </Typography>
        </Box>
        {avgLatency > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Avg Latency
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                {(avgLatency / 1000).toFixed(1)}s
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

/**
 * Errors panel showing aggregated errors
 */
function ErrorsPanel({ errors }: { errors: JobError[] }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);

  if (errors.length === 0) {
    return null;
  }

  const totalErrorCount = errors.reduce((sum, e) => sum + e.count, 0);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          py: 0.5,
        }}
      >
        <WarningIcon sx={{ color: theme.palette.warning.main, mr: 1, fontSize: 20 }} />
        <Typography variant="subtitle2" color="text.secondary">
          Errors ({totalErrorCount})
        </Typography>
        <IconButton
          size="small"
          sx={{
            ml: 'auto',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.palette.warning.main + '10',
            border: `1px solid ${theme.palette.warning.main}30`,
          }}
        >
          {errors.map((error, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 0.5,
                '&:not(:last-child)': {
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  pb: 1,
                  mb: 1,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={error.type.replace('_', ' ')}
                  size="small"
                  sx={{
                    textTransform: 'capitalize',
                    backgroundColor: theme.palette.warning.main + '20',
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  {error.message}
                </Typography>
              </Box>
              {error.count > 1 && (
                <Typography variant="caption" color="text.secondary">
                  ×{error.count}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * Completion summary showing vulnerabilities and top categories
 */
function CompletionSummary({
  summary,
  evalId,
}: {
  summary: JobCompletionSummary;
  evalId: string | null;
}) {
  const theme = useTheme();

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          backgroundColor:
            summary.vulnerabilitiesFound > 0
              ? theme.palette.error.main + '10'
              : theme.palette.success.main + '10',
          border: `1px solid ${summary.vulnerabilitiesFound > 0 ? theme.palette.error.main : theme.palette.success.main}30`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 1 }}>
          {summary.vulnerabilitiesFound > 0 ? (
            <Box component="span" sx={{ color: theme.palette.error.main }}>
              {summary.vulnerabilitiesFound} vulnerabilities found
            </Box>
          ) : (
            <Box component="span" sx={{ color: theme.palette.success.main }}>
              No vulnerabilities found
            </Box>
          )}
        </Typography>

        {summary.topCategories.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Top categories:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {summary.topCategories.map((cat, index) => (
                <Chip
                  key={index}
                  label={`${cat.name} (${cat.count})`}
                  size="small"
                  sx={{ backgroundColor: theme.palette.error.main + '20' }}
                />
              ))}
            </Box>
          </>
        )}

        {evalId && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Typography variant="body2">
              <a href={`/reports?evalId=${evalId}`} style={{ color: theme.palette.primary.main }}>
                View Full Report →
              </a>
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
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
  phase,
  phaseDetail,
  metrics,
  errors,
  summary,
}: ExecutionProgressProps & { evalId?: string | null }) {
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
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {/* Header with status and elapsed time */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {status === 'complete' && <CheckCircleIcon sx={{ color: theme.palette.success.main }} />}
          {status === 'error' && <ErrorIcon sx={{ color: theme.palette.error.main }} />}
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
                  backgroundColor: theme.palette.primary.main + '20',
                }}
              />
            )}
          </Box>
        </Box>
        {elapsedTime !== null && (
          <Typography variant="body2" color="text.secondary">
            {formatElapsedTime(elapsedTime)}
          </Typography>
        )}
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
        (metrics.testPassCount > 0 ||
          metrics.testFailCount > 0 ||
          metrics.testErrorCount > 0) && <ResultsPanel metrics={metrics} />}

      {/* Completion summary */}
      {status === 'complete' && summary && <CompletionSummary summary={summary} evalId={null} />}

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
