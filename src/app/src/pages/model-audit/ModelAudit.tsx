import { useCallback, useEffect, useRef, useState } from 'react';

import { CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material';
import SecurityIcon from '@mui/icons-material/Security';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Fade from '@mui/material/Fade';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { callApi } from '@app/utils/api';
import AdvancedOptionsDialog from './components/AdvancedOptionsDialog';
import ConfigurationTab from './components/ConfigurationTab';
import ResultsTab from './components/ResultsTab';
import ScannedFilesDialog from './components/ScannedFilesDialog';
import { useModelAuditStore } from './store';

import type { ScanOptions, ScanPath, ScanResult } from './ModelAudit.types';

// Cache key and duration
const INSTALLATION_CACHE_KEY = 'modelaudit_installation_status';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface InstallationStatus {
  checking: boolean;
  installed: boolean | null;
  lastChecked: number | null;
  error: string | null;
}

interface CachedInstallationStatus {
  installed: boolean;
  cwd: string;
  timestamp: number;
}

export default function ModelAudit() {
  const [paths, setPaths] = useState<ScanPath[]>([]);
  const [scanOptions, setScanOptions] = useState<ScanOptions>({
    blacklist: [],
    timeout: 300,
    verbose: false,
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);
  const [installationStatus, setInstallationStatus] = useState<InstallationStatus>({
    checking: false,
    installed: null,
    lastChecked: null,
    error: null,
  });
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('');
  const [activeTab, setActiveTab] = useState(0);
  const [showFilesDialog, setShowFilesDialog] = useState(false);
  const [showInstallationDialog, setShowInstallationDialog] = useState(false);

  // Ref for request deduplication
  const checkInstallationPromiseRef = useRef<Promise<{ installed: boolean; cwd: string }> | null>(
    null,
  );

  const { addRecentScan } = useModelAuditStore();

  useEffect(() => {
    useModelAuditStore.persist.rehydrate();
  }, []);

  // Load cached status on mount
  useEffect(() => {
    const cached = localStorage.getItem(INSTALLATION_CACHE_KEY);
    if (cached) {
      try {
        const data: CachedInstallationStatus = JSON.parse(cached);
        // Use cached data immediately for good UX
        setInstallationStatus({
          checking: false,
          installed: data.installed,
          lastChecked: data.timestamp,
          error: null,
        });
        setCurrentWorkingDir(data.cwd || '');
      } catch {
        // Ignore invalid cache
      }
    }
  }, []);

  // Check if modelaudit is installed with deduplication
  const checkModelAuditInstalled = useCallback(async (force = false): Promise<void> => {
    // If already checking and not forcing, return existing promise
    if (checkInstallationPromiseRef.current && !force) {
      await checkInstallationPromiseRef.current;
      return;
    }

    // Check cache first (unless forced)
    if (!force) {
      const cached = localStorage.getItem(INSTALLATION_CACHE_KEY);
      if (cached) {
        try {
          const data: CachedInstallationStatus = JSON.parse(cached);
          const age = Date.now() - data.timestamp;
          if (age < CACHE_DURATION) {
            // Cache is still valid, but we'll check in background anyway
            setInstallationStatus({
              checking: false,
              installed: data.installed,
              lastChecked: data.timestamp,
              error: null,
            });
            setCurrentWorkingDir(data.cwd || '');
          }
        } catch {
          // Ignore invalid cache
        }
      }
    }

    // Set checking state
    setInstallationStatus((prev) => ({ ...prev, checking: true, error: null }));

    // Create deduplicated promise
    checkInstallationPromiseRef.current = callApi('/model-audit/check-installed')
      .then(async (response) => {
        const data = await response.json();
        const timestamp = Date.now();

        // Update state
        setInstallationStatus({
          checking: false,
          installed: data.installed,
          lastChecked: timestamp,
          error: null,
        });
        setCurrentWorkingDir(data.cwd || '');

        // Cache the result
        const cacheData: CachedInstallationStatus = {
          installed: data.installed,
          cwd: data.cwd || '',
          timestamp,
        };
        localStorage.setItem(INSTALLATION_CACHE_KEY, JSON.stringify(cacheData));

        return data;
      })
      .catch((err) => {
        setInstallationStatus({
          checking: false,
          installed: false,
          lastChecked: Date.now(),
          error: 'Failed to check installation status',
        });
        return { installed: false, cwd: '' };
      })
      .finally(() => {
        // Clear the promise after completion
        checkInstallationPromiseRef.current = null;
      });

    await checkInstallationPromiseRef.current;
  }, []);

  // Check on mount and periodically in background
  useEffect(() => {
    // Initial check
    checkModelAuditInstalled();

    // Background check every 5 minutes
    const interval = setInterval(
      () => {
        checkModelAuditInstalled();
      },
      5 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [checkModelAuditInstalled]);

  const handleAddPath = (path: ScanPath) => {
    setPaths([...paths, path]);
  };

  const handleRemovePath = (index: number) => {
    setPaths(paths.filter((_, i) => i !== index));
  };

  const handleScan = async () => {
    // Check installation status first
    if (installationStatus.installed === false) {
      setShowInstallationDialog(true);
      return;
    }

    // If installation status is unknown or checking, verify first
    if (installationStatus.installed === null || installationStatus.checking) {
      await checkModelAuditInstalled(true); // Force check
      // Re-check will happen through state update, but we need to wait
      // for the current check to complete
      return;
    }

    if (paths.length === 0) {
      setError('Please add at least one path to scan');
      return;
    }

    setIsScanning(true);
    setError(null);
    setScanResults(null);

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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scan models');
      }

      const data = await response.json();
      setScanResults(data);
      setActiveTab(1); // Switch to results tab

      // Add to recent scans
      addRecentScan(paths);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during scanning');
    } finally {
      setIsScanning(false);
    }
  };

  // Remove blocking UI - go straight to main UI
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <SecurityIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight={700}>
            Model Audit
          </Typography>

          {/* Installation Status Indicator */}
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
        <Typography variant="body1" color="text.secondary" sx={{ ml: 7 }}>
          Scan model files for security vulnerabilities and potential risks
        </Typography>
      </Box>

      {/* Main Content Card */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => setActiveTab(val)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 3,
            bgcolor: (theme) =>
              theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[50],
          }}
        >
          <Tab label="Configuration" />
          <Tab label="Results" disabled={!scanResults} />
        </Tabs>

        {/* Configuration Tab */}
        <Fade in={activeTab === 0}>
          <Box sx={{ display: activeTab === 0 ? 'block' : 'none', p: 4 }}>
            <ConfigurationTab
              paths={paths}
              onAddPath={handleAddPath}
              onRemovePath={handleRemovePath}
              onShowOptions={() => setShowOptionsDialog(true)}
              onScan={handleScan}
              isScanning={isScanning}
              error={error}
              onClearError={() => setError(null)}
              currentWorkingDir={currentWorkingDir}
              installationStatus={installationStatus}
            />
          </Box>
        </Fade>

        {/* Results Tab */}
        <Fade in={activeTab === 1}>
          <Box sx={{ display: activeTab === 1 ? 'block' : 'none', p: 4 }}>
            {scanResults && (
              <ResultsTab
                scanResults={scanResults}
                onShowFilesDialog={() => setShowFilesDialog(true)}
              />
            )}
          </Box>
        </Fade>
      </Paper>

      {/* Advanced Options Dialog */}
      <AdvancedOptionsDialog
        open={showOptionsDialog}
        onClose={() => setShowOptionsDialog(false)}
        scanOptions={scanOptions}
        onOptionsChange={setScanOptions}
      />

      {/* Scanned Files Dialog */}
      <ScannedFilesDialog
        open={showFilesDialog}
        onClose={() => setShowFilesDialog(false)}
        scanResults={scanResults}
        paths={paths}
      />

      {/* Installation Dialog */}
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
            onClick={() => checkModelAuditInstalled(true)}
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
