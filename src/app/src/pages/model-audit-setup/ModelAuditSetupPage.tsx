import { useCallback, useEffect } from 'react';

import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  IconButton,
  Link,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AdvancedOptionsDialog from '../model-audit/components/AdvancedOptionsDialog';
import ConfigurationTab from '../model-audit/components/ConfigurationTab';
import ResultsTab from '../model-audit/components/ResultsTab';
import ScannedFilesDialog from '../model-audit/components/ScannedFilesDialog';
import { useModelAuditConfigStore, useModelAuditHistoryStore } from '../model-audit/stores';

import type { ScanResult } from '../model-audit/ModelAudit.types';

export default function ModelAuditSetupPage() {
  const navigate = useNavigate();

  const {
    paths,
    scanOptions,
    isScanning,
    scanResults,
    error,
    installationStatus,
    showFilesDialog,
    showOptionsDialog,
    setPaths,
    removePath,
    setScanOptions,
    setIsScanning,
    setScanResults,
    setError,
    checkInstallation,
    setShowFilesDialog,
    setShowOptionsDialog,
    addRecentScan,
  } = useModelAuditConfigStore();

  const { fetchHistoricalScans } = useModelAuditHistoryStore();

  useEffect(() => {
    useModelAuditConfigStore.persist.rehydrate();
    checkInstallation();
  }, [checkInstallation]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);

    try {
      const response = await callApi('/model-audit/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paths: paths.map((p) => p.path),
          options: scanOptions,
        }),
      });

      const data: ScanResult & { auditId?: string; persisted?: boolean } = await response.json();

      if (!response.ok) {
        const errorData = data as unknown as { error: string };
        throw new Error(errorData.error || 'Failed to run security scan');
      }

      setScanResults(data);
      addRecentScan(paths);

      // Refresh history to include the new scan if it was persisted
      if (data.persisted) {
        fetchHistoricalScans();
        // Navigate to the result page if we have an audit ID
        if (data.auditId) {
          navigate(MODEL_AUDIT_ROUTES.DETAIL(data.auditId));
          return;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsScanning(false);
    }
  }, [
    paths,
    scanOptions,
    setIsScanning,
    setError,
    setScanResults,
    addRecentScan,
    fetchHistoricalScans,
    navigate,
  ]);

  const handleRemovePath = useCallback(
    (index: number) => {
      const pathToRemove = paths[index];
      if (pathToRemove) {
        removePath(pathToRemove.path);
      }
    },
    [paths, removePath],
  );

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
          <Stack direction="row" alignItems="center" mb={4}>
            <Box>
              <Typography variant="h4" gutterBottom fontWeight="bold">
                Model Audit Setup
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Configure and run a security scan on ML models.{' '}
                <Link href="https://www.promptfoo.dev/docs/model-audit/" target="_blank">
                  Learn more
                </Link>
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto' }}>
              {installationStatus.checking ? (
                <Tooltip title="Checking ModelAudit installation...">
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Checking...
                    </Typography>
                  </Stack>
                </Tooltip>
              ) : installationStatus.installed === true ? (
                <Tooltip title="ModelAudit is installed and ready">
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="body2" color="success.main">
                      Ready
                    </Typography>
                  </Stack>
                </Tooltip>
              ) : installationStatus.installed === false ? (
                <Tooltip title={installationStatus.error || 'ModelAudit is not installed'}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    <Typography variant="body2" color="error.main">
                      Not Installed
                    </Typography>
                    <IconButton size="small" onClick={() => checkInstallation()} sx={{ p: 0.5 }}>
                      <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                </Tooltip>
              ) : null}
            </Box>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <ConfigurationTab
            paths={paths}
            isScanning={isScanning}
            onAddPath={(path) => {
              setPaths([...paths, path]);
            }}
            onRemovePath={handleRemovePath}
            onShowOptions={() => setShowOptionsDialog(true)}
            onScan={handleScan}
            error={error}
            onClearError={() => setError(null)}
            currentWorkingDir={installationStatus.cwd || ''}
            installationStatus={installationStatus}
            onRetryInstallationCheck={checkInstallation}
          />

          {/* Show inline results if scan completed but wasn't persisted */}
          {scanResults && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h5" gutterBottom fontWeight={600}>
                Scan Results
              </Typography>
              <ResultsTab
                scanResults={scanResults}
                onShowFilesDialog={() => setShowFilesDialog(true)}
              />
            </Box>
          )}
        </Paper>

        <AdvancedOptionsDialog
          open={showOptionsDialog}
          onClose={() => setShowOptionsDialog(false)}
          scanOptions={scanOptions}
          onOptionsChange={setScanOptions}
        />

        {scanResults && (
          <ScannedFilesDialog
            open={showFilesDialog}
            onClose={() => setShowFilesDialog(false)}
            scanResults={scanResults}
            paths={paths}
          />
        )}
      </Container>
    </Box>
  );
}
