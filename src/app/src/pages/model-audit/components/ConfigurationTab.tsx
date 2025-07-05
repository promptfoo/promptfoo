import React from 'react';
import { PlayArrow as PlayArrowIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { ScanPath } from '../ModelAudit.types';
import PathSelector from './PathSelector';

interface ConfigurationTabProps {
  paths: ScanPath[];
  onAddPath: (path: ScanPath) => void;
  onRemovePath: (index: number) => void;
  onShowOptions: () => void;
  onScan: () => void;
  isScanning: boolean;
  error: string | null;
  onClearError: () => void;
  currentWorkingDir?: string;
}

export default function ConfigurationTab({
  paths,
  onAddPath,
  onRemovePath,
  onShowOptions,
  onScan,
  isScanning,
  error,
  onClearError,
  currentWorkingDir,
}: ConfigurationTabProps) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Select Models
        </Typography>
        <Button variant="outlined" startIcon={<SettingsIcon />} onClick={onShowOptions}>
          Advanced Options
        </Button>
      </Stack>

      <PathSelector
        paths={paths}
        onAddPath={onAddPath}
        onRemovePath={onRemovePath}
        currentWorkingDir={currentWorkingDir}
      />

      <Box sx={{ mt: 4 }}>
        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={onScan}
          disabled={isScanning || paths.length === 0}
          startIcon={isScanning ? <CircularProgress size={20} /> : <PlayArrowIcon />}
          sx={{ py: 1.5 }}
        >
          {isScanning ? 'Scanning...' : 'Start Security Scan'}
        </Button>

        {error && (
          <Alert severity="error" onClose={onClearError} sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
