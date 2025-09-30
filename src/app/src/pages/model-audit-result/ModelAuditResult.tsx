import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Breadcrumbs,
  Link,
  Button,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import ResultsTab from '@app/pages/model-audit/components/ResultsTab';
import type { ScanResult as BaseScanResult } from '@app/pages/model-audit/ModelAudit.types';

interface ScanResult {
  id: string;
  name: string | null;
  author: string | null;
  modelPath: string;
  modelType?: string | null;
  createdAt: number;
  updatedAt: number;
  hasErrors: boolean;
  totalChecks?: number | null;
  passedChecks?: number | null;
  failedChecks?: number | null;
  results: BaseScanResult;
  metadata?: Record<string, any> | null;
}

export default function ModelAuditResult() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchScan = async () => {
      try {
        const response = await callApi(`/model-audit/scans/${id}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch scan details');
        }
        const data = await response.json();
        setScan(data);
      } catch (err) {
        // Don't set error state if the request was aborted
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      } finally {
        // Don't set loading to false if the request was aborted
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (id) {
      fetchScan();
    }

    // Cleanup: abort request when component unmounts or id changes
    return () => {
      abortController.abort();
      // Also abort any pending delete operation
      if (deleteControllerRef.current) {
        deleteControllerRef.current.abort();
      }
    };
  }, [id]);

  const handleDelete = async () => {
    if (!id || !scan) {
      return;
    }

    const deleteController = new AbortController();
    deleteControllerRef.current = deleteController;
    setIsDeleting(true);

    try {
      const response = await callApi(`/model-audit/scans/${id}`, {
        method: 'DELETE',
        signal: deleteController.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }

      // Navigate back to history page after successful deletion
      navigate('/model-audit/history');
    } catch (err) {
      // Don't set error state if the request was aborted (e.g., user navigated away)
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to delete scan');
      }
    } finally {
      // Don't set loading state if the request was aborted
      if (!deleteController.signal.aborted) {
        setIsDeleting(false);
      }
      // Clear the ref
      deleteControllerRef.current = null;
    }
  };

  const handleDownload = async () => {
    if (!scan) {
      return;
    }

    try {
      const dataStr = JSON.stringify(scan, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const exportFileDefaultName = `model-audit-${scan.id}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', url);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      // Clean up the object URL to free memory
      URL.revokeObjectURL(url);
    } catch (_err) {
      setError('Failed to download scan results');
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '50vh',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading scan details...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button
          component={RouterLink}
          to="/model-audit/history"
          startIcon={<ArrowBackIcon />}
          variant="outlined"
        >
          Back to History
        </Button>
      </Box>
    );
  }

  if (!scan) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Scan not found.
        </Alert>
        <Button
          component={RouterLink}
          to="/model-audit/history"
          startIcon={<ArrowBackIcon />}
          variant="outlined"
        >
          Back to History
        </Button>
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
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <Container maxWidth="xl">
        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, mb: 4 }}>
          {/* Breadcrumb Navigation */}
          <Box sx={{ mb: 3, overflow: 'hidden' }}>
            <Breadcrumbs
              aria-label="breadcrumb"
              separator="›"
              sx={{
                '& .MuiBreadcrumbs-ol': {
                  flexWrap: isMobile ? 'wrap' : 'nowrap',
                },
              }}
            >
              <Tooltip title="Go to Model Audit main page">
                <Link component={RouterLink} to="/model-audit" underline="hover" color="inherit">
                  Model Audit
                </Link>
              </Tooltip>
              <Tooltip title="Go to scan history">
                <Link
                  component={RouterLink}
                  to="/model-audit/history"
                  underline="hover"
                  color="inherit"
                >
                  History
                </Link>
              </Tooltip>
              <Tooltip title={scan.name || `Scan ${scan.id}`}>
                <Typography
                  color="text.primary"
                  sx={{
                    maxWidth: isMobile ? '150px' : '300px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {scan.name || `Scan ${scan.id.slice(-8)}`}
                </Typography>
              </Tooltip>
            </Breadcrumbs>
          </Box>

          {/* Header with Actions */}
          <Box sx={{ mb: 4 }}>
            <Stack
              direction={isMobile ? 'column' : 'row'}
              spacing={2}
              alignItems={isMobile ? 'flex-start' : 'flex-start'}
              justifyContent="space-between"
            >
              <Box sx={{ flex: 1, width: '100%' }}>
                <Stack
                  direction={isMobile ? 'column' : 'row'}
                  spacing={isMobile ? 1 : 2}
                  alignItems={isMobile ? 'flex-start' : 'center'}
                  sx={{ mb: 2 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton
                      component={RouterLink}
                      to="/model-audit/history"
                      size="small"
                      sx={{ minWidth: 44, minHeight: 44 }}
                      aria-label="Go back to scan history"
                    >
                      <ArrowBackIcon />
                    </IconButton>
                    <Typography
                      variant={isMobile ? 'h5' : 'h4'}
                      fontWeight="bold"
                      sx={{
                        wordBreak: 'break-word',
                        lineHeight: 1.2,
                      }}
                    >
                      {scan.name || `Scan ${scan.id.slice(-8)}`}
                    </Typography>
                  </Box>
                  <Chip
                    label={scan.hasErrors ? 'Issues Found' : 'Clean'}
                    color={scan.hasErrors ? 'error' : 'success'}
                    variant="filled"
                    sx={{ fontWeight: 500, alignSelf: isMobile ? 'flex-start' : 'center' }}
                  />
                </Stack>

                {/* Scan Metadata */}
                <Stack
                  direction={isMobile ? 'column' : 'row'}
                  spacing={isMobile ? 2 : 3}
                  sx={{
                    mb: 2,
                    flexWrap: 'wrap',
                    '& > *': {
                      minWidth: isMobile ? 'unset' : '120px',
                    },
                  }}
                >
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Created
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatDataGridDate(scan.createdAt)}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: isMobile ? 'unset' : 1, minWidth: 0 }}>
                    <Typography variant="body2" color="text.secondary">
                      Model Path
                    </Typography>
                    <Tooltip title={scan.modelPath} arrow>
                      <Typography
                        variant="body2"
                        fontWeight="medium"
                        sx={{
                          wordBreak: 'break-all',
                          cursor: 'help',
                          maxWidth: isMobile ? 'none' : '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: isMobile ? 'normal' : 'nowrap',
                        }}
                      >
                        {scan.modelPath}
                      </Typography>
                    </Tooltip>
                  </Box>
                  {scan.author && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Author
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {scan.author}
                      </Typography>
                    </Box>
                  )}
                  {scan.totalChecks !== null && scan.totalChecks !== undefined && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Checks Passed
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {scan.passedChecks || 0} / {scan.totalChecks}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  ID: {scan.id}
                </Typography>
              </Box>

              {/* Action Buttons */}
              <Stack
                direction="row"
                spacing={isMobile ? 0.5 : 1}
                sx={{
                  alignSelf: isMobile ? 'flex-start' : 'flex-end',
                  mt: isMobile ? 2 : 0,
                }}
              >
                <Tooltip title="Download Results">
                  <IconButton
                    onClick={handleDownload}
                    color="primary"
                    sx={{ minWidth: 44, minHeight: 44 }}
                    aria-label="Download scan results as JSON"
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Refresh">
                  <IconButton
                    onClick={() => window.location.reload()}
                    color="primary"
                    sx={{ minWidth: 44, minHeight: 44 }}
                    aria-label="Refresh scan details"
                  >
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Scan">
                  <IconButton
                    onClick={handleDelete}
                    color="error"
                    disabled={isDeleting}
                    sx={{ minWidth: 44, minHeight: 44 }}
                    aria-label={isDeleting ? 'Deleting scan...' : 'Delete scan permanently'}
                  >
                    {isDeleting ? <CircularProgress size={20} /> : <DeleteIcon />}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
          </Box>

          {/* Scan Results */}
          <ResultsTab scanResults={scan.results} onShowFilesDialog={() => {}} />
        </Paper>
      </Container>
    </Box>
  );
}
