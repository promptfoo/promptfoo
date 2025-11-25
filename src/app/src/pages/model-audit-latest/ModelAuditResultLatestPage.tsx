import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Container,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Add as AddIcon, History as HistoryIcon } from '@mui/icons-material';

import ResultsTab from '../model-audit/components/ResultsTab';
import type { ScanResult } from '../model-audit/ModelAudit.types';

interface LatestScan extends ScanResult {
  id: string;
  name: string | null;
  author: string | null;
  modelPath: string;
  createdAt: number;
  hasErrors: boolean;
  totalChecks?: number;
  passedChecks?: number;
  failedChecks?: number;
  metadata?: Record<string, any> | null;
}

export default function ModelAuditResultLatestPage() {
  const [latestScan, setLatestScan] = useState<LatestScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_showFilesDialog, setShowFilesDialog] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchLatestScan = async () => {
      try {
        setLoading(true);

        // Try to fetch latest scan with dedicated endpoint, fallback to scans list
        let response;
        try {
          response = await callApi('/model-audit/scans/latest', {
            cache: 'no-store',
            signal: abortController.signal,
          });

          if (response.ok) {
            if (response.status === 204) {
              // No content - no scans exist
              setLatestScan(null);
              return;
            }
            const latestScanData = await response.json();
            setLatestScan(latestScanData);
            return;
          }
        } catch (_err) {
          // If latest endpoint doesn't exist, fallback to scans list
        }

        // Fallback: fetch first scan from the scans list
        response = await callApi('/model-audit/scans?limit=1', {
          cache: 'no-store',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch latest scan');
        }

        const data = await response.json();
        const scans = data.scans || [];

        if (scans.length > 0) {
          // Sort by createdAt desc to get the latest
          const sortedScans = scans.sort(
            (a: LatestScan, b: LatestScan) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          setLatestScan(sortedScans[0]);
        } else {
          setLatestScan(null);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to fetch latest scan');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchLatestScan();

    return () => {
      abortController.abort();
    };
  }, []);

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
          Loading latest scan...
        </Typography>
      </Box>
    );
  }

  if (error) {
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
          <Paper elevation={0} sx={{ p: { xs: 3, md: 5 } }}>
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
            <Button component={RouterLink} to="/model-audit/setup" variant="contained">
              Start a New Scan
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  if (!latestScan) {
    // Empty state - no scans exist
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
          <Paper elevation={0} sx={{ p: { xs: 3, md: 5 } }}>
            {/* Breadcrumb Navigation */}
            <Box sx={{ mb: 3 }}>
              <Breadcrumbs aria-label="breadcrumb">
                <Typography color="text.primary">Model Audit</Typography>
              </Breadcrumbs>
            </Box>

            <Box
              sx={{
                textAlign: 'center',
                py: 8,
              }}
            >
              <Box sx={{ fontSize: '3rem', mb: 2 }}>🔍</Box>
              <Typography variant="h4" gutterBottom fontWeight="bold">
                No scans found
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
              >
                Get started by running your first model security scan. You can scan ML models,
                datasets, and other AI assets for potential security vulnerabilities.
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center">
                <Button
                  component={RouterLink}
                  to="/model-audit/setup"
                  variant="contained"
                  startIcon={<AddIcon />}
                  size="large"
                >
                  Start a Scan
                </Button>
                <Button
                  component={RouterLink}
                  to="/model-audit/history"
                  variant="outlined"
                  startIcon={<HistoryIcon />}
                  size="large"
                >
                  View History
                </Button>
              </Stack>
            </Box>
          </Paper>
        </Container>
      </Box>
    );
  }

  // Display latest scan results
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
        <Paper elevation={0} sx={{ p: { xs: 3, md: 5 } }}>
          {/* Breadcrumb Navigation */}
          <Box sx={{ mb: 3 }}>
            <Breadcrumbs aria-label="breadcrumb">
              <Typography color="text.primary">Model Audit</Typography>
            </Breadcrumbs>
          </Box>

          {/* Header */}
          <Box sx={{ mb: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="h4" gutterBottom fontWeight="bold">
                  Latest Scan Results
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {latestScan.name || `Scan ${latestScan.id.slice(-8)}`} • {latestScan.modelPath}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  component={RouterLink}
                  to="/model-audit/setup"
                  variant="outlined"
                  startIcon={<AddIcon />}
                >
                  New Scan
                </Button>
                <Button
                  component={RouterLink}
                  to="/model-audit/history"
                  variant="outlined"
                  startIcon={<HistoryIcon />}
                >
                  View History
                </Button>
              </Stack>
            </Stack>
          </Box>

          {/* Results */}
          <ResultsTab scanResults={latestScan} onShowFilesDialog={() => setShowFilesDialog(true)} />

          {/* Link to detailed view */}
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Link
              component={RouterLink}
              to={`/model-audit/history/${latestScan.id}`}
              sx={{ fontWeight: 'medium' }}
            >
              View detailed scan information →
            </Link>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
