import React from 'react';
import {
  CheckCircle as CheckCircleIcon,
  Code as CodeIcon,
  Download as DownloadIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { SeverityBadge } from '../ModelAudit.styles';
import type { ScanResult } from '../ModelAudit.types';

interface SecurityFindingsProps {
  scanResults: ScanResult;
  selectedSeverity: string | null;
  onSeverityChange: (severity: string | null) => void;
  showRawOutput: boolean;
  onToggleRawOutput: () => void;
}

export default function SecurityFindings({
  scanResults,
  selectedSeverity,
  onSeverityChange,
  showRawOutput,
  onToggleRawOutput,
}: SecurityFindingsProps) {
  const theme = useTheme();

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <ErrorIcon fontSize="small" />;
      case 'warning':
        return <WarningIcon fontSize="small" />;
      case 'info':
        return <InfoIcon fontSize="small" />;
      default:
        return <InfoIcon fontSize="small" />;
    }
  };

  const handleDownloadResults = () => {
    const csvHeaders = ['Severity', 'Message', 'Location', 'Details'];
    const csvRows = scanResults.issues.map((issue) => {
      const details = issue.details ? JSON.stringify(issue.details).replace(/"/g, '""') : '';
      const location = issue.location || issue.details?.path || '';
      return [
        issue.severity,
        `"${issue.message.replace(/"/g, '""')}"`,
        `"${location.replace(/"/g, '""')}"`,
        `"${details}"`,
      ].join(',');
    });

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const exportFileDefaultName = `model-audit-${new Date().toISOString().split('T')[0]}.csv`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const filteredIssues = scanResults.issues.filter((issue) => {
    if (!selectedSeverity && issue.severity === 'debug') {
      return false;
    }
    return !selectedSeverity || issue.severity === selectedSeverity;
  });

  return (
    <Box>
      {scanResults.issues.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Total issues found: {scanResults.issues.length} (including{' '}
          {scanResults.issues.filter((i) => i.severity === 'debug').length} debug messages)
        </Alert>
      )}

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Security Findings
        </Typography>
        <Stack direction="row" spacing={2}>
          <Select
            value={selectedSeverity || 'all'}
            onChange={(e) => onSeverityChange(e.target.value === 'all' ? null : e.target.value)}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="error">Errors Only</MenuItem>
            <MenuItem value="warning">Warnings Only</MenuItem>
            <MenuItem value="info">Info Only</MenuItem>
            <MenuItem value="debug">Debug Only</MenuItem>
          </Select>
          <Button variant="outlined" onClick={handleDownloadResults} startIcon={<DownloadIcon />}>
            Export Report
          </Button>
          {scanResults.rawOutput && (
            <Button variant="outlined" onClick={onToggleRawOutput} startIcon={<CodeIcon />}>
              {showRawOutput ? 'Hide' : 'Show'} Raw Output
            </Button>
          )}
        </Stack>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {filteredIssues.length === 0 ? (
        <Paper
          sx={{
            p: 6,
            textAlign: 'center',
            bgcolor: alpha(theme.palette.success.main, 0.05),
          }}
        >
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" color="success.main">
            {selectedSeverity
              ? `No ${selectedSeverity} issues found`
              : 'No security issues detected'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your models appear to be secure and ready for deployment.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {filteredIssues.map((issue, index) => (
            <Paper
              key={index}
              sx={{
                p: 3,
                borderLeft: 4,
                borderColor:
                  issue.severity === 'error'
                    ? 'error.main'
                    : issue.severity === 'warning'
                      ? 'warning.main'
                      : 'info.main',
                bgcolor: alpha(
                  issue.severity === 'error'
                    ? theme.palette.error.main
                    : issue.severity === 'warning'
                      ? theme.palette.warning.main
                      : theme.palette.info.main,
                  0.02,
                ),
              }}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                {getSeverityIcon(issue.severity)}
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body1" fontWeight={600}>
                      {issue.message}
                    </Typography>
                    <SeverityBadge severity={issue.severity}>{issue.severity}</SeverityBadge>
                  </Stack>
                  {(issue.location || (issue.details && issue.details.path)) && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Location: <code>{issue.location || issue.details?.path}</code>
                    </Typography>
                  )}
                  {issue.details && (
                    <Collapse in={true}>
                      <Paper
                        sx={{
                          p: 2,
                          mt: 2,
                          bgcolor: (theme) =>
                            theme.palette.mode === 'dark'
                              ? theme.palette.grey[800]
                              : theme.palette.grey[50],
                        }}
                        variant="outlined"
                      >
                        <Typography
                          variant="caption"
                          component="pre"
                          sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                        >
                          {JSON.stringify(issue.details, null, 2)}
                        </Typography>
                      </Paper>
                    </Collapse>
                  )}
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {showRawOutput && scanResults.rawOutput && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Raw Scanner Output
          </Typography>
          <Paper
            sx={{
              p: 2,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50],
              color: (theme) =>
                theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[900],
              overflow: 'auto',
              maxHeight: 400,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            variant="outlined"
          >
            {scanResults.rawOutput}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
