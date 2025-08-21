import { useEffect, useState } from 'react';

import {
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useModelAuditStore } from '../store';

import type { ScanIssue } from '../ModelAudit.types';

export default function HistoryTab() {
  const {
    historicalScans,
    isLoadingHistory,
    historyError,
    fetchHistoricalScans,
    deleteHistoricalScan,
    viewHistoricalScan,
  } = useModelAuditStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Fetch historical scans when component mounts
    fetchHistoricalScans();
  }, []);

  const handleDelete = async () => {
    if (!scanToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteHistoricalScan(scanToDelete);
      setDeleteDialogOpen(false);
      setScanToDelete(null);
    } catch (error) {
      console.error('Failed to delete scan:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getSeverityColor = (hasErrors: boolean) => {
    return hasErrors ? 'error' : 'success';
  };

  const getSeverityIcon = (hasErrors: boolean) => {
    return hasErrors ? (
      <ErrorIcon sx={{ fontSize: 16 }} />
    ) : (
      <CheckCircleIcon sx={{ fontSize: 16 }} />
    );
  };

  if (isLoadingHistory) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (historyError) {
    return (
      <Alert
        severity="error"
        sx={{ mt: 2 }}
        action={
          <Button color="inherit" size="small" onClick={fetchHistoricalScans}>
            Retry
          </Button>
        }
      >
        {historyError}
      </Alert>
    );
  }

  if (historicalScans.length === 0) {
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Stack alignItems="center" spacing={2} py={4}>
            <Typography variant="h6" color="text.secondary">
              No scan history found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Run your first scan to see it appear here
            </Typography>
            <Button
              startIcon={<RefreshIcon />}
              onClick={fetchHistoricalScans}
              variant="outlined"
              size="small"
            >
              Refresh
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Scan History</Typography>
        <Button startIcon={<RefreshIcon />} onClick={fetchHistoricalScans} size="small">
          Refresh
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Model Path</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Issues Found</TableCell>
              <TableCell align="center">Checks</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {historicalScans.map((scan) => (
              <TableRow
                key={scan.id}
                hover
                onClick={() => viewHistoricalScan(scan)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Tooltip title={scan.id}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {scan.id}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(scan.createdAt)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                    {scan.name || 'Unnamed scan'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={scan.modelPath}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                      {scan.modelPath}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={scan.hasErrors ? 'Issues Found' : 'Clean'}
                    color={getSeverityColor(scan.hasErrors)}
                    size="small"
                    variant="filled"
                    icon={getSeverityIcon(scan.hasErrors)}
                    sx={{
                      fontWeight: 500,
                      minWidth: 90,
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  {scan.results?.issues ? (
                    <IssueSeverityChips issues={scan.results.issues} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      -
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {scan.totalChecks !== undefined && scan.totalChecks !== null ? (
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Typography variant="body2" color="success.main">
                        {scan.passedChecks || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        /
                      </Typography>
                      <Typography variant="body2">{scan.totalChecks}</Typography>
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      -
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="View Results">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewHistoricalScan(scan);
                        }}
                        color="primary"
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setScanToDelete(scan.id);
                          setDeleteDialogOpen(true);
                        }}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !isDeleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Scan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this scan from history? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

interface IssueSeverityChipsProps {
  issues: ScanIssue[] | undefined;
}

function IssueSeverityChips({ issues }: IssueSeverityChipsProps) {
  if (!issues) {
    return (
      <Typography variant="body2" color="text.secondary">
        -
      </Typography>
    );
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const totalCriticalErrors = criticalCount + errorCount;

  return (
    <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap">
      {criticalCount > 0 && (
        <Chip
          label={`${criticalCount} Critical`}
          color="error"
          size="small"
          variant="filled"
          sx={{
            fontWeight: 600,
            fontSize: '0.75rem',
            height: 22,
          }}
        />
      )}
      {errorCount > 0 && (
        <Chip
          label={`${errorCount} Error${errorCount > 1 ? 's' : ''}`}
          color="error"
          size="small"
          variant="outlined"
          sx={{
            fontWeight: 500,
            fontSize: '0.75rem',
            height: 22,
          }}
        />
      )}
      {warningCount > 0 && (
        <Chip
          label={`${warningCount} Warning${warningCount > 1 ? 's' : ''}`}
          color="warning"
          size="small"
          variant="outlined"
          sx={{
            fontWeight: 500,
            fontSize: '0.75rem',
            height: 22,
          }}
        />
      )}
      {totalCriticalErrors === 0 && warningCount === 0 && (
        <Chip
          label="No Issues"
          color="success"
          size="small"
          variant="outlined"
          sx={{
            fontWeight: 500,
            fontSize: '0.75rem',
            height: 22,
          }}
        />
      )}
    </Stack>
  );
}
