import { useEffect } from 'react';

import { CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';

import { callApi } from '@app/utils/api';

import AdvancedOptionsDialog from './components/AdvancedOptionsDialog';
import ConfigurationTab from './components/ConfigurationTab';
import ResultsTab from './components/ResultsTab';
import ScannedFilesDialog from './components/ScannedFilesDialog';
import type { ScanResult } from './ModelAudit.types';
import { useModelAuditStore } from './store';

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
    showInstallationDialog,
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
    setShowInstallationDialog,
    setShowOptionsDialog,
    addRecentScan,
  } = useModelAuditStore();

  useEffect(() => {
    useModelAuditStore.persist.rehydrate();
  }, []);

  // Check on mount and periodically in background
  useEffect(() => {
    // Initial check
    checkInstallation();

    // Background check every 5 minutes
    const interval = setInterval(
      () => {
        checkInstallation();
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [checkInstallation]);

  const handleScan = async () => {
    // Check installation status before scanning
    if (installationStatus.installed === false) {
      setShowInstallationDialog(true);
      return;
    }

    // If installation status is unknown or checking, wait for it
    if (installationStatus.installed === null || installationStatus.checking) {
      await checkInstallation();
      // Check again after the promise resolves
      const state = useModelAuditStore.getState();
      if (state.installationStatus.installed === false) {
        setShowInstallationDialog(true);
        return;
      }
    }

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

      const data: ScanResult = await response.json();

      if (!response.ok) {
        const errorData = data as unknown as { error: string };
        throw new Error(errorData.error || 'Failed to run security scan');
      }

      setScanResults(data);
      setActiveTab(1); // Switch to Results tab
      addRecentScan(paths); // Add to recent scans
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper elevation={0} sx={{ p: 4, mb: 4, backgroundColor: 'white' }}>
        <Stack direction="row" alignItems="center" mb={4}>
          <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">
              Model Audit
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Scan ML models for security vulnerabilities using{' '}
              <Link href="https://github.com/protectai/modelaudit" target="_blank">
                ModelAudit
              </Link>
              , powered by Protect AI
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
              <Tooltip title="ModelAudit is not installed. Click to learn more.">
                <Button
                  size="small"
                  startIcon={<ErrorIcon sx={{ fontSize: 16 }} />}
                  color="error"
                  onClick={() => setShowInstallationDialog(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Not Installed
                </Button>
              </Tooltip>
            ) : null}
          </Box>
        </Stack>

        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Configuration" />
          <Tab label="Results" disabled={!scanResults} />
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

      <Dialog
        open={showInstallationDialog}
        onClose={() => setShowInstallationDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={2}>
            <ErrorIcon color="error" />
            <Typography variant="h6">ModelAudit Not Installed</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            ModelAudit is required to scan ML models for security vulnerabilities.
          </Typography>
          <Paper sx={{ p: 2, bgcolor: 'action.hover', mb: 2 }}>
            <Typography variant="body2" fontFamily="monospace">
              pip install modelaudit
            </Typography>
          </Paper>
          <Typography variant="body2" color="text.secondary">
            After installation, click the refresh button to verify.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => checkInstallation()}
            disabled={installationStatus.checking}
          >
            {installationStatus.checking ? 'Checking...' : 'Refresh Status'}
          </Button>
          <Button
            variant="contained"
            href="https://www.promptfoo.dev/docs/model-audit/"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Documentation
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
