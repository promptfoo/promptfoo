import React, { useEffect, useState } from 'react';

import {
  Delete as DeleteIcon,
  Error as ErrorIcon,
  Visibility as VisibilityIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';

import { callApi } from '@app/utils/api';

import type { ScanHistoryItem, ScanListApiResponse, StoredScan } from '../ModelAudit.types';

interface ScanHistoryProps {
  onViewScan: (scan: StoredScan) => void;
}

export default function ScanHistory({ onViewScan }: ScanHistoryProps) {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const fetchScans = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await callApi(
        `/model-audit/scans?limit=${rowsPerPage}&offset=${page * rowsPerPage}`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch scan history');
      }
      const data: ScanListApiResponse = await response.json();
      setScans(data.scans);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scan history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();
  }, [page, rowsPerPage]);

  const handleViewScan = async (scanId: string) => {
    try {
      const response = await callApi(`/model-audit/scans/${scanId}`);
      if (!response.ok) {
        throw new Error('Failed to load scan details');
      }
      const scan: StoredScan = await response.json();
      onViewScan(scan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scan details');
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    if (!confirm('Are you sure you want to delete this scan?')) {
      return;
    }

    try {
      const response = await callApi(`/model-audit/scans/${scanId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }
      // Refresh the list
      fetchScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scan');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (loading && scans.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (scans.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No scan history found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Run a scan to see it appear here
        </Typography>
      </Paper>
    );
  }

  return (
    <>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Path</TableCell>
              <TableCell>Author</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="center">Issues</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scans.map((scan) => (
              <TableRow
                key={scan.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => handleViewScan(scan.id)}
              >
                <TableCell>{formatDate(scan.createdAt)}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                  >
                    {scan.primaryPath}
                  </Typography>
                </TableCell>
                <TableCell>{scan.author || '-'}</TableCell>
                <TableCell>{scan.description || '-'}</TableCell>
                <TableCell align="center">
                  <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                    {scan.criticalCount > 0 && (
                      <Tooltip title={`${scan.criticalCount} critical issues`}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
                          <Typography variant="body2" color="error">
                            {scan.criticalCount}
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
                    {scan.warningCount > 0 && (
                      <Tooltip title={`${scan.warningCount} warnings`}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                          <Typography variant="body2" color="warning.main">
                            {scan.warningCount}
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
                    {scan.issueCount === 0 && (
                      <Typography variant="body2" color="success.main">
                        Clean
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="View scan details">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewScan(scan.id);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete scan">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScan(scan.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </>
  );
}
