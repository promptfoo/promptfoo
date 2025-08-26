import { useEffect } from 'react';

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
  Fade,
  IconButton,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import AdvancedOptionsDialog from './components/AdvancedOptionsDialog';
import ConfigurationTab from './components/ConfigurationTab';
import HistoryTab from './components/HistoryTab';
import ResultsTab from './components/ResultsTab';
import ScannedFilesDialog from './components/ScannedFilesDialog';
import { useModelAuditStore } from './store';

import type { ScanResult } from './ModelAudit.types';

export default function ModelAudit() {
  const {
    // State
    paths,
    scanOptions,
    isScanning,
    scanResults,
    error,
    installationStatus,
    activeTab,
    showFilesDialog,
    showOptionsDialog,

    // Actions
    setPaths,
    removePath,
    setScanOptions,
    setIsScanning,
    setScanResults,
    setError,
    checkInstallation,
    setActiveTab,
    setShowFilesDialog,
    setShowOptionsDialog,
    addRecentScan,
    fetchHistoricalScans,
  } = useModelAuditStore();

  useEffect(() => {
    useModelAuditStore.persist.rehydrate();
    // Check installation status immediately after rehydration
    checkInstallation();
  }, []); // Remove checkInstallation dependency to avoid potential issues

  const handleScan = async () => {
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
      setActiveTab(1); // Switch to Results tab
      addRecentScan(paths); // Add to recent scans

      // Refresh history to include the new scan if it was persisted
      if (data.persisted) {
        fetchHistoricalScans();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRemovePath = (index: number) => {
    const pathToRemove = paths[index];
    if (pathToRemove) {
      removePath(pathToRemove.path);
    }
  };

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
                Model Audit
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Scan ML models for security vulnerabilities.{' '}
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

          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Configuration" />
            <Tab label="Results" disabled={!scanResults} />
            <Tab label="History" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Box sx={{ mt: 3 }}>
            <Fade in={activeTab === 0} unmountOnExit>
              <Box>
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
                />
              </Box>
            </Fade>

            <Fade in={activeTab === 1} unmountOnExit>
              <Box>
                {scanResults && (
                  <ResultsTab
                    scanResults={scanResults}
                    onShowFilesDialog={() => setShowFilesDialog(true)}
                  />
                )}
              </Box>
            </Fade>

            <Fade in={activeTab === 2} unmountOnExit>
              <Box>
                <HistoryTab />
              </Box>
            </Fade>
          </Box>
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
