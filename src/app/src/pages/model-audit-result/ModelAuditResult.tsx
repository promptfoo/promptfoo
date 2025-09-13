import { useEffect, useState } from 'react';
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
  Tooltip
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
  results: any; // This should match the ScanResult type from ModelAudit.types.ts
  metadata?: Record<string, any> | null;
}

export default function ModelAuditResult() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchScan = async () => {
      try {
        const response = await callApi(`/model-audit/scans/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch scan details');
        }
        const data = await response.json();
        setScan(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchScan();
    }
  }, [id]);

  const handleDelete = async () => {
    if (!id || !scan) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await callApi(`/model-audit/scans/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }

      // Navigate back to history page after successful deletion
      navigate('/model-audit/history');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scan');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
    if (!scan) {
      return;
    }

    try {
      const dataStr = JSON.stringify(scan, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `model-audit-${scan.id}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
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
      }}
    >
      <Container maxWidth="xl">
        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 }, mb: 4 }}>
          {/* Breadcrumb Navigation */}
          <Box sx={{ mb: 3 }}>
            <Breadcrumbs aria-label="breadcrumb">
              <Link component={RouterLink} to="/model-audit" underline="hover" color="inherit">
                Model Audit
              </Link>
              <Link component={RouterLink} to="/model-audit/history" underline="hover" color="inherit">
                History
              </Link>
              <Typography color="text.primary">
                {scan.name || `Scan ${scan.id.slice(-8)}`}
              </Typography>
            </Breadcrumbs>
          </Box>

          {/* Header with Actions */}
          <Box sx={{ mb: 4 }}>
            <Stack direction="row" spacing={2} alignItems="flex-start" justifyContent="space-between">
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <IconButton
                    component={RouterLink}
                    to="/model-audit/history"
                    size="small"
                    sx={{ mr: 1 }}
                    aria-label="Go back to scan history"
                  >
                    <ArrowBackIcon />
                  </IconButton>
                  <Typography variant="h4" fontWeight="bold">
                    {scan.name || `Scan ${scan.id.slice(-8)}`}
                  </Typography>
                  <Chip
                    label={scan.hasErrors ? 'Issues Found' : 'Clean'}
                    color={scan.hasErrors ? 'error' : 'success'}
                    variant="filled"
                    sx={{ fontWeight: 500 }}
                  />
                </Stack>

                {/* Scan Metadata */}
                <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Created
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {formatDataGridDate(scan.createdAt)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Model Path
                    </Typography>
                    <Typography variant="body2" fontWeight="medium" sx={{ wordBreak: 'break-all' }}>
                      {scan.modelPath}
                    </Typography>
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
              <Stack direction="row" spacing={1}>
                <Tooltip title="Download Results">
                  <IconButton
                    onClick={handleDownload}
                    color="primary"
                    aria-label="Download scan results as JSON"
                  >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Refresh">
                  <IconButton
                    onClick={() => window.location.reload()}
                    color="primary"
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
                    aria-label={isDeleting ? "Deleting scan..." : "Delete scan permanently"}
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
