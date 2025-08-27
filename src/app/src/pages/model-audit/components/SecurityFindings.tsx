import { useMemo, useState } from 'react';

import {
  CheckCircle as CheckCircleIcon,
  Code as CodeIcon,
  Download as DownloadIcon,
  Error as ErrorIcon,
  ExpandLess,
  ExpandMore,
  InsertDriveFile as FileIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { SeverityBadge } from '../ModelAudit.styles';
import {
  getIssueFilePath,
  getSeverityLabel,
  isCriticalSeverity,
  mapSeverityForFiltering,
} from '../utils';

import type { ScanIssue, ScanResult } from '../ModelAudit.types';

interface SecurityFindingsProps {
  scanResults: ScanResult;
  selectedSeverity: string | null;
  onSeverityChange: (severity: string | null) => void;
  showRawOutput: boolean;
  onToggleRawOutput: () => void;
}

// Helper function to generate issue summary text
function getIssueSummaryText(issues: ScanIssue[]): string {
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const totalMeaningful = criticalCount + errorCount + warningCount;

  if (totalMeaningful === 0) {
    return `${issues.length} informational messages found`;
  }

  const parts = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical`);
  }
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }

  return `${totalMeaningful} security issue${totalMeaningful > 1 ? 's' : ''} found: ${parts.join(', ')}`;
}

export default function SecurityFindings({
  scanResults,
  selectedSeverity,
  onSeverityChange,
  showRawOutput,
  onToggleRawOutput,
}: SecurityFindingsProps) {
  const theme = useTheme();
  const [groupByFile, setGroupByFile] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showFullRawOutput, setShowFullRawOutput] = useState(false);

  // Constants for performance optimization
  const MAX_OUTPUT_LENGTH = 10000;

  // Compute stringified output for raw display (memoized for performance)
  const stringifiedScanResults = useMemo(() => {
    return JSON.stringify(scanResults, null, 2);
  }, [scanResults]);

  const truncatedScanResults = useMemo(() => {
    return stringifiedScanResults.length > MAX_OUTPUT_LENGTH
      ? stringifiedScanResults.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]'
      : stringifiedScanResults;
  }, [stringifiedScanResults, MAX_OUTPUT_LENGTH]);

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
      const location = getIssueFilePath(issue);
      return [
        getSeverityLabel(issue.severity),
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
    return mapSeverityForFiltering(selectedSeverity, issue.severity);
  });

  // Group issues by file
  const issuesByFile = filteredIssues.reduce(
    (acc, issue) => {
      const file = getIssueFilePath(issue);

      if (!acc[file]) {
        acc[file] = [];
      }
      acc[file].push(issue);
      return acc;
    },
    {} as Record<string, ScanIssue[]>,
  );

  const toggleFileExpansion = (file: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(file)) {
      newExpanded.delete(file);
    } else {
      newExpanded.add(file);
    }
    setExpandedFiles(newExpanded);
  };

  const toggleAllFiles = () => {
    if (expandedFiles.size === Object.keys(issuesByFile).length) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(Object.keys(issuesByFile)));
    }
  };

  return (
    <Box>
      {scanResults.issues.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {getIssueSummaryText(scanResults.issues)}
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6">Security Findings</Typography>
        <Box sx={{ flexGrow: 1 }} />

        <Button
          size="small"
          onClick={() => setGroupByFile(!groupByFile)}
          startIcon={groupByFile ? <FileIcon /> : <CodeIcon />}
        >
          {groupByFile ? 'Group by File' : 'Flat List'}
        </Button>

        {groupByFile && Object.keys(issuesByFile).length > 1 && (
          <Button
            size="small"
            onClick={toggleAllFiles}
            startIcon={
              expandedFiles.size === Object.keys(issuesByFile).length ? (
                <ExpandLess />
              ) : (
                <ExpandMore />
              )
            }
          >
            {expandedFiles.size === Object.keys(issuesByFile).length
              ? 'Collapse All'
              : 'Expand All'}
          </Button>
        )}

        <Select
          value={selectedSeverity || 'all'}
          onChange={(e) => onSeverityChange(e.target.value === 'all' ? null : e.target.value)}
          size="small"
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="error">Critical Only</MenuItem>
          <MenuItem value="warning">Warnings Only</MenuItem>
          <MenuItem value="info">Info Only</MenuItem>
          <MenuItem value="debug">Debug Only</MenuItem>
        </Select>

        <Button size="small" onClick={handleDownloadResults} startIcon={<DownloadIcon />}>
          Export CSV
        </Button>

        <Button size="small" onClick={onToggleRawOutput} startIcon={<CodeIcon />}>
          {showRawOutput ? 'Hide' : 'Show'} Raw Output
        </Button>
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
              ? `No ${getSeverityLabel(selectedSeverity)} issues found`
              : 'No security issues detected'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your models appear to be secure and ready for deployment.
          </Typography>
        </Paper>
      ) : groupByFile ? (
        <Stack spacing={4}>
          {Object.entries(issuesByFile).map(([file, issues]) => {
            const criticalCount = issues.filter((i) => isCriticalSeverity(i.severity)).length;
            const warningCount = issues.filter((i) => i.severity === 'warning').length;
            const infoCount = issues.filter((i) => i.severity === 'info').length;
            const isExpanded = expandedFiles.has(file);
            const fileName = file.split('/').pop() || file;

            return (
              <Paper
                key={file}
                elevation={1}
                sx={{
                  overflow: 'hidden',
                  border: 1,
                  borderColor: criticalCount > 0 ? 'error.main' : 'divider',
                  borderWidth: criticalCount > 0 ? 2 : 1,
                }}
              >
                {/* File Header */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: alpha(
                      criticalCount > 0
                        ? theme.palette.error.main
                        : warningCount > 0
                          ? theme.palette.warning.main
                          : theme.palette.primary.main,
                      0.08,
                    ),
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={2}>
                    <FileIcon
                      sx={{
                        color:
                          criticalCount > 0
                            ? 'error.main'
                            : warningCount > 0
                              ? 'warning.main'
                              : 'primary.main',
                      }}
                    />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography
                        variant="h6"
                        sx={{
                          color:
                            criticalCount > 0
                              ? 'error.main'
                              : warningCount > 0
                                ? 'warning.dark'
                                : 'text.primary',
                        }}
                      >
                        {fileName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {file}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {criticalCount > 0 && (
                        <Chip
                          size="small"
                          label={`${criticalCount} critical`}
                          color="error"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                      {warningCount > 0 && (
                        <Chip
                          size="small"
                          label={`${warningCount} warning${warningCount > 1 ? 's' : ''}`}
                          color="warning"
                        />
                      )}
                      {infoCount > 0 && (
                        <Chip size="small" label={`${infoCount} info`} color="info" />
                      )}
                    </Stack>
                  </Stack>
                </Box>

                {/* Expandable Trigger */}
                <Box
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: alpha(theme.palette.action.hover, 0.01),
                    '&:hover': {
                      bgcolor: alpha(theme.palette.action.hover, 0.04),
                    },
                    transition: 'background-color 0.2s',
                  }}
                  onClick={() => toggleFileExpansion(file)}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <IconButton size="small" sx={{ p: 0.5 }}>
                      {isExpanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {isExpanded ? 'Hide' : 'Show'} {issues.length} Issue
                      {issues.length !== 1 ? 's' : ''}
                    </Typography>
                  </Stack>
                </Box>

                {/* Collapsible Issues Content */}
                <Collapse in={isExpanded}>
                  <Divider />
                  <Box sx={{ p: 2, bgcolor: alpha(theme.palette.action.hover, 0.01) }}>
                    <Stack spacing={2}>
                      {issues.map((issue, index) => (
                        <Paper
                          key={index}
                          variant="outlined"
                          sx={{
                            p: 2.5,
                            borderLeft: 4,
                            borderLeftColor: isCriticalSeverity(issue.severity)
                              ? 'error.main'
                              : issue.severity === 'warning'
                                ? 'warning.main'
                                : 'info.main',
                            bgcolor: alpha(
                              isCriticalSeverity(issue.severity)
                                ? theme.palette.error.main
                                : issue.severity === 'warning'
                                  ? theme.palette.warning.main
                                  : theme.palette.info.main,
                              0.03,
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
                                <SeverityBadge severity={issue.severity}>
                                  {getSeverityLabel(issue.severity)}
                                </SeverityBadge>
                              </Stack>
                              {issue.details && (
                                <Alert severity="info" sx={{ mt: 2 }}>
                                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(issue.details, null, 2)}
                                  </pre>
                                </Alert>
                              )}
                            </Box>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        // Original flat list view
        <Stack spacing={2}>
          {filteredIssues.map((issue, index) => (
            <Paper
              key={index}
              sx={{
                p: 3,
                borderLeft: 4,
                borderColor: isCriticalSeverity(issue.severity)
                  ? 'error.main'
                  : issue.severity === 'warning'
                    ? 'warning.main'
                    : 'info.main',
                bgcolor: alpha(
                  isCriticalSeverity(issue.severity)
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
                    <SeverityBadge severity={issue.severity}>
                      {getSeverityLabel(issue.severity)}
                    </SeverityBadge>
                  </Stack>
                  {getIssueFilePath(issue) !== 'Unknown' && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Location: {getIssueFilePath(issue)}
                    </Typography>
                  )}
                  {issue.details && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(issue.details, null, 2)}
                      </pre>
                    </Alert>
                  )}
                </Box>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Raw Output Dialog */}
      <Dialog
        open={showRawOutput}
        onClose={onToggleRawOutput}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle>Raw Scanner Output</DialogTitle>
        <DialogContent>
          <pre
            style={{
              backgroundColor:
                theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50],
              color:
                theme.palette.mode === 'dark' ? theme.palette.grey[100] : theme.palette.grey[900],
              padding: theme.spacing(2),
              borderRadius: theme.shape.borderRadius,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          >
            {scanResults.rawOutput
              ? scanResults.rawOutput
              : showFullRawOutput
                ? stringifiedScanResults
                : truncatedScanResults}
          </pre>
          {!scanResults.rawOutput && stringifiedScanResults.length > MAX_OUTPUT_LENGTH && (
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 2, ml: 2 }}
              onClick={() => setShowFullRawOutput((prev) => !prev)}
            >
              {showFullRawOutput ? 'Show Less' : 'Show More'}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
