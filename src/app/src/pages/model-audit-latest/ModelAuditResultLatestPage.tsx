import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import {
  Add as AddIcon,
  History as HistoryIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { Alert, Box, Button, Container, Link, Paper, Stack, Typography } from '@mui/material';
import { LatestScanSkeleton } from '../model-audit/components/ModelAuditSkeleton';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';

import type { HistoricalScan } from '../model-audit/stores';

export default function ModelAuditResultLatestPage() {
  const [latestScan, setLatestScan] = useState<HistoricalScan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilesDialog, setShowFilesDialog] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchLatestScan = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try to get the latest scan
        const response = await callApi('/model-audit/scans?limit=1&sort=createdAt&order=desc', {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch latest scan');
        }

        const data = await response.json();
        const scans = data.scans || [];

        if (scans.length > 0) {
          setLatestScan(scans[0]);
        } else {
          setLatestScan(null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : 'Failed to load latest scan';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestScan();

    return () => abortController.abort();
  }, []);

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
          <LatestScanSkeleton />
        </Container>
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
        <Container maxWidth="md">
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Stack direction="row" spacing={2}>
            <Button component={RouterLink} to="/model-audit/setup" variant="contained">
              Go to Setup
            </Button>
            <Button component={RouterLink} to="/model-audit/history" variant="outlined">
              View History
            </Button>
          </Stack>
        </Container>
      </Box>
    );
  }

  // Empty state - no scans yet
  if (!latestScan) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark'
              ? theme.palette.background.default
              : theme.palette.grey[50],
          py: 8,
        }}
      >
        <Container maxWidth="md">
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <SecurityIcon sx={{ fontSize: 64, color: 'primary.main', mb: 3 }} />
            <Typography variant="h4" gutterBottom fontWeight={600}>
              No Model Scans Yet
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Run your first security scan to detect vulnerabilities in ML models.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Model Audit scans models for security issues like pickle exploits, unsafe
              deserialization, and malicious code injection.{' '}
              <Link href="https://www.promptfoo.dev/docs/model-audit/" target="_blank">
                Learn more
              </Link>
            </Typography>
            <Button
              component={RouterLink}
              to="/model-audit/setup"
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              sx={{ mt: 4 }}
            >
              Run Your First Scan
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  // Show latest scan results
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
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
            mb={4}
          >
            <Box>
              <Typography variant="h4" gutterBottom fontWeight="bold">
                Latest Scan Results
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {latestScan.name || 'Model Security Scan'} •{' '}
                {formatDataGridDate(latestScan.createdAt)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={2}>
              <Button
                component={RouterLink}
                to="/model-audit/setup"
                variant="contained"
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

          {latestScan.results && (
            <ResultsTab
              scanResults={latestScan.results}
              onShowFilesDialog={() => setShowFilesDialog(true)}
              totalChecks={latestScan.totalChecks}
              passedChecks={latestScan.passedChecks}
              failedChecks={latestScan.failedChecks}
            />
          )}
        </Paper>

        {latestScan.results && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={latestScan.results}
            paths={((latestScan.metadata?.originalPaths as string[] | undefined) ?? []).map(
              (p: string) => ({
                path: p,
                type: p.endsWith('/') ? ('directory' as const) : ('file' as const),
                name: p.split('/').filter(Boolean).pop() || p,
              }),
            )}
          />
        )}
      </Container>
    </Box>
  );
}
