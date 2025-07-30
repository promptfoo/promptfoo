import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PathSelector from './PathSelector';

import type { ScanPath } from '../ModelAudit.types';

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
  installationStatus?: {
    checking: boolean;
    installed: boolean | null;
  };
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
  installationStatus,
}: ConfigurationTabProps) {
  const isCheckingInstallation = installationStatus?.checking ?? false;
  const isNotInstalled = installationStatus?.installed === false;
  const installationUnknown = installationStatus?.installed === null;

  const scanButtonDisabled = isScanning || paths.length === 0 || isCheckingInstallation;

  const getScanButtonText = () => {
    if (isScanning) {
      return 'Scanning...';
    }
    if (isCheckingInstallation) {
      return 'Checking Installation...';
    }
    if (isNotInstalled) {
      return 'ModelAudit Not Installed';
    }
    if (installationUnknown) {
      return 'Start Security Scan (Checking...)';
    }
    return 'Start Security Scan';
  };

  const getScanButtonTooltip = () => {
    if (paths.length === 0) {
      return 'Add at least one path to scan';
    }
    if (isCheckingInstallation) {
      return 'Checking if ModelAudit is installed...';
    }
    if (isNotInstalled) {
      return 'Click to see installation instructions';
    }
    if (installationUnknown) {
      return 'Installation status will be verified when you click';
    }
    return '';
  };

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
        <Tooltip title={getScanButtonTooltip()} placement="top">
          <span>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={onScan}
              disabled={scanButtonDisabled}
              color={isNotInstalled ? 'error' : 'primary'}
              startIcon={
                isScanning || isCheckingInstallation ? (
                  <CircularProgress size={20} />
                ) : (
                  <PlayArrowIcon />
                )
              }
              sx={{ py: 1.5 }}
            >
              {getScanButtonText()}
            </Button>
          </span>
        </Tooltip>

        {error && (
          <Alert severity="error" onClose={onClearError} sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
