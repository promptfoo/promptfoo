import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { StatCard } from '../ModelAudit.styles';

import type { ScanResult } from '../ModelAudit.types';

interface ScanStatisticsProps {
  scanResults: ScanResult;
  selectedSeverity: string | null;
  onSeverityClick: (severity: string | null) => void;
  onFilesClick: () => void;
}

export default function ScanStatistics({
  scanResults,
  selectedSeverity,
  onSeverityClick,
  onFilesClick,
}: ScanStatisticsProps) {
  const theme = useTheme();

  const severityStats = [
    {
      severity: 'error',
      icon: ErrorIcon,
      label: 'Critical',
      color: theme.palette.error.main,
      count: scanResults.issues.filter((i) => i.severity === 'error').length,
    },
    {
      severity: 'warning',
      icon: WarningIcon,
      label: 'Warnings',
      color: theme.palette.warning.main,
      count: scanResults.issues.filter((i) => i.severity === 'warning').length,
    },
    {
      severity: 'info',
      icon: InfoIcon,
      label: 'Information',
      color: theme.palette.info.main,
      count: scanResults.issues.filter((i) => i.severity === 'info').length,
    },
  ];

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {severityStats.map(({ severity, icon: Icon, label, color, count }) => (
        <Grid item xs={12} sm={6} md={3} key={severity}>
          <Tooltip
            title={
              selectedSeverity === severity
                ? 'Click to show all issues'
                : `Click to filter by ${label.toLowerCase()}`
            }
            placement="top"
          >
            <StatCard
              elevation={0}
              sx={{
                bgcolor: alpha(color, 0.05),
                border: selectedSeverity === severity ? 2 : 0,
                borderColor: color,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 2,
                },
              }}
              onClick={() => onSeverityClick(selectedSeverity === severity ? null : severity)}
            >
              <Icon sx={{ fontSize: 40, color, mb: 1 }} />
              <Typography variant="h3" fontWeight={700} sx={{ color }}>
                {count}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
            </StatCard>
          </Tooltip>
        </Grid>
      ))}
      <Grid item xs={12} sm={6} md={3}>
        <Tooltip title="Click to see which files were scanned" placement="top">
          <StatCard
            elevation={0}
            sx={{
              bgcolor: alpha(theme.palette.success.main, 0.05),
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 2,
              },
            }}
            onClick={onFilesClick}
          >
            <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
            <Typography variant="h3" fontWeight={700} color="success.main">
              {scanResults.scannedFiles || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Files Scanned
            </Typography>
          </StatCard>
        </Tooltip>
      </Grid>
    </Grid>
  );
}
