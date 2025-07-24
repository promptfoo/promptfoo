import React, { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import SecurityIcon from '@mui/icons-material/Security';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Fade from '@mui/material/Fade';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import AdvancedOptionsDialog from './components/AdvancedOptionsDialog';
import ConfigurationTab from './components/ConfigurationTab';
import InstallationCheck from './components/InstallationCheck';
import ResultsTab from './components/ResultsTab';
import ScannedFilesDialog from './components/ScannedFilesDialog';
import { useModelAuditStore } from './store';

import type { ScanOptions, ScanPath, ScanResult } from './ModelAudit.types';

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
  const [modelAuditInstalled, setModelAuditInstalled] = useState<boolean | null>(null);
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('');
  const [activeTab, setActiveTab] = useState(0);
  const [showFilesDialog, setShowFilesDialog] = useState(false);

  const { addRecentScan } = useModelAuditStore();

  useEffect(() => {
    useModelAuditStore.persist.rehydrate();
  }, []);

  // Check if modelaudit is installed
  const checkModelAuditInstalled = async () => {
    try {
      const response = await callApi('/model-audit/check-installed');
      const data = await response.json();
      setModelAuditInstalled(data.installed);
      setCurrentWorkingDir(data.cwd || '');
    } catch {
      setModelAuditInstalled(false);
    }
  };

  React.useEffect(() => {
    checkModelAuditInstalled();
  }, []);

  const handleAddPath = (path: ScanPath) => {
    setPaths([...paths, path]);
  };

  const handleRemovePath = (index: number) => {
    setPaths(paths.filter((_, i) => i !== index));
  };

  const handleScan = async () => {
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

  if (modelAuditInstalled === null) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography>Checking ModelAudit installation...</Typography>
        </Stack>
      </Container>
    );
  }

  if (modelAuditInstalled === false) {
    return <InstallationCheck />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <SecurityIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight={700}>
            Model Audit
          </Typography>
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
    </Container>
  );
}
