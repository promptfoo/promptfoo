import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { formatDataGridDate } from '@app/utils/date';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { ResultPageSkeleton } from '../model-audit/components/ModelAuditSkeleton';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';
import { useModelAuditHistoryStore } from '../model-audit/stores';

import type { HistoricalScan } from '../model-audit/stores';

export default function ModelAuditResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { fetchScanById, deleteHistoricalScan } = useModelAuditHistoryStore();

  const [scan, setScan] = useState<HistoricalScan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No scan ID provided');
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const loadScan = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchScanById(id, abortController.signal);
        if (result) {
          setScan(result);
        } else {
          setError('Scan not found');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to load scan';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadScan();

    return () => abortController.abort();
  }, [id, fetchScanById]);

  const handleDelete = useCallback(async () => {
    if (!id) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteHistoricalScan(id);
      setDeleteDialogOpen(false);
      navigate('/model-audit/history');
    } catch (err) {
      console.error('Failed to delete scan:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [id, deleteHistoricalScan, navigate]);

  const handleDownload = useCallback(() => {
    if (!scan?.results) {
      return;
    }

    const json = JSON.stringify(scan.results, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-audit-${scan.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scan]);

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? theme.palette.background.default
              : theme.palette.grey[50],
          py: 4,
        }}
      >
        <Container maxWidth="xl">
          <ResultPageSkeleton />
        </Container>
      </Box>
    );
  }

  if (error || !scan) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? theme.palette.background.default
              : theme.palette.grey[50],
          py: 4,
        }}
      >
        <Container maxWidth="md">
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || 'Scan not found'}
          </Alert>
          <Stack direction="row" spacing={2}>
            <Button
              component={RouterLink}
              to="/model-audit/history"
              variant="contained"
              startIcon={<ArrowBackIcon />}
            >
              Back to History
            </Button>
            <Button component={RouterLink} to="/model-audit/setup" variant="outlined">
              New Scan
            </Button>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? theme.palette.background.default : theme.palette.grey[50],
        py: 4,
      }}
    >
      <Container maxWidth="xl">
        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, mb: 4 }}>
          {/* Breadcrumbs */}
          <Breadcrumbs sx={{ mb: 3 }}>
            <Link component={RouterLink} to="/model-audit" underline="hover" color="inherit">
              Model Audit
            </Link>
            <Link
              component={RouterLink}
              to="/model-audit/history"
              underline="hover"
              color="inherit"
            >
              History
            </Link>
            <Typography color="text.primary">{scan.name || scan.id.slice(0, 8)}</Typography>
          </Breadcrumbs>

          {/* Header */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
            mb={4}
          >
            <Box>
              <Typography variant="h4" gutterBottom fontWeight="bold">
                {scan.name || 'Model Security Scan'}
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Created: {formatDataGridDate(scan.createdAt)}
                </Typography>
                {scan.author && (
                  <Typography variant="body2" color="text.secondary">
                    • Author: {scan.author}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                  • ID: {scan.id.slice(0, 12)}...
                </Typography>
              </Stack>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Download
              </Button>
              <Button
                component={RouterLink}
                to="/model-audit/history"
                variant="outlined"
                size="small"
                startIcon={<HistoryIcon />}
              >
                History
              </Button>
              <Button
                color="error"
                variant="outlined"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </Stack>
          </Stack>

          {/* Scan Metadata */}
          <Paper variant="outlined" sx={{ p: 2, mb: 4 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Scan Details
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Model Path
                </Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {scan.modelPath}
                </Typography>
              </Box>
              {scan.totalChecks !== undefined && scan.totalChecks !== null && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Checks
                  </Typography>
                  <Typography variant="body2">
                    <Typography component="span" color="success.main">
                      {scan.passedChecks || 0} passed
                    </Typography>
                    {' / '}
                    <Typography component="span" color="error.main">
                      {scan.failedChecks || 0} failed
                    </Typography>
                    {' / '}
                    {scan.totalChecks} total
                  </Typography>
                </Box>
              )}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Typography
                  variant="body2"
                  color={scan.hasErrors ? 'error.main' : 'success.main'}
                  fontWeight={500}
                >
                  {scan.hasErrors ? 'Issues Found' : 'Clean'}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {/* Results */}
          {scan.results && (
            <ResultsTab
              scanResults={scan.results}
              onShowFilesDialog={() => setShowFilesDialog(true)}
            />
          )}
        </Paper>

        {/* Scanned Files Dialog */}
        {scan.results && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={scan.results}
            paths={((scan.metadata?.originalPaths as string[] | undefined) ?? []).map(
              (p: string) => ({
                path: p,
                type: p.endsWith('/') ? ('directory' as const) : ('file' as const),
                name: p.split('/').filter(Boolean).pop() || p,
              }),
            )}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => !isDeleting && setDeleteDialogOpen(false)}>
          <DialogTitle>Delete Scan?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete this scan? This action cannot be undone.
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
      </Container>
    </Box>
  );
}
