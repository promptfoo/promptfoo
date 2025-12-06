import { useMemo } from 'react';
import ErrorIcon from '@mui/icons-material/Error';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { useTheme, alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import type { VulnerabilitySeverityCounts } from '@promptfoo/types';

interface SeverityCountersProps {
  counts: VulnerabilitySeverityCounts;
  sx?: SxProps<Theme>;
}

interface SeverityConfig {
  label: string;
  color: string;
  icon: React.ReactElement;
  tooltip: string;
}

/**
 * Displays live vulnerability counts by severity level.
 * Shows animated counters that update as vulnerabilities are discovered.
 */
export default function SeverityCounters({ counts, sx = {} }: SeverityCountersProps) {
  const theme = useTheme();

  const severityConfigs: Record<keyof VulnerabilitySeverityCounts, SeverityConfig> = useMemo(
    () => ({
      critical: {
        label: 'Critical',
        color: theme.palette.error.main,
        icon: <ErrorIcon sx={{ fontSize: 16 }} />,
        tooltip: 'Critical security vulnerabilities (SQL injection, shell injection, etc.)',
      },
      high: {
        label: 'High',
        color: theme.palette.warning.dark,
        icon: <ReportProblemIcon sx={{ fontSize: 16 }} />,
        tooltip: 'High severity issues (PII exposure, data leakage, etc.)',
      },
      medium: {
        label: 'Medium',
        color: theme.palette.warning.main,
        icon: <WarningIcon sx={{ fontSize: 16 }} />,
        tooltip: 'Medium severity issues (harmful content, jailbreaks, etc.)',
      },
      low: {
        label: 'Low',
        color: theme.palette.info.main,
        icon: <InfoIcon sx={{ fontSize: 16 }} />,
        tooltip: 'Low severity issues (quality concerns, minor policy violations, etc.)',
      },
    }),
    [theme],
  );

  const totalCount = counts.critical + counts.high + counts.medium + counts.low;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        ...sx,
      }}
    >
      {(Object.keys(severityConfigs) as Array<keyof VulnerabilitySeverityCounts>).map(
        (severity) => {
          const config = severityConfigs[severity];
          const count = counts[severity];

          return (
            <Tooltip key={severity} title={config.tooltip}>
              <Chip
                icon={config.icon}
                label={`${config.label}: ${count}`}
                size="small"
                sx={{
                  backgroundColor: alpha(config.color, 0.1),
                  color: config.color,
                  fontWeight: count > 0 ? 600 : 400,
                  borderColor: count > 0 ? config.color : 'transparent',
                  borderWidth: count > 0 ? 1 : 0,
                  borderStyle: 'solid',
                  transition: 'all 0.3s ease',
                  '& .MuiChip-icon': {
                    color: config.color,
                  },
                  // Pulse animation when count increases
                  ...(count > 0 && {
                    animation: 'pulse 0.5s ease-in-out',
                    '@keyframes pulse': {
                      '0%': { transform: 'scale(1)' },
                      '50%': { transform: 'scale(1.05)' },
                      '100%': { transform: 'scale(1)' },
                    },
                  }),
                }}
              />
            </Tooltip>
          );
        },
      )}
      {totalCount > 0 && (
        <Chip
          label={`Total: ${totalCount}`}
          size="small"
          variant="outlined"
          sx={{
            fontWeight: 600,
            ml: 1,
          }}
        />
      )}
    </Box>
  );
}
