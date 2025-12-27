import { useMemo } from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { getEstimatedProbes } from './strategies/utils';
import type { SxProps, Theme } from '@mui/material/styles';

import type { Config } from '../types';

interface EstimatedProbesDisplayProps {
  config: Config;
  tooltipContent?: string;
  sx?: SxProps<Theme>;
}

const DEFAULT_TOOLTIP =
  'Probes are the number of requests to the target application. ' +
  'This is calculated based on your selected plugins, strategies, and number of test cases.';

export default function EstimatedProbesDisplay({
  config,
  tooltipContent = DEFAULT_TOOLTIP,
  sx = {},
}: EstimatedProbesDisplayProps) {
  const theme = useTheme();

  const estimatedProbes = useMemo(() => getEstimatedProbes(config), [config]);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 3,
        p: 2,
        borderRadius: 1,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="body1" color="text.secondary">
          Estimated Probes:
        </Typography>
      </Box>
      <Typography variant="body1" fontWeight="bold" color="primary.main">
        {estimatedProbes.toLocaleString()}
      </Typography>
      <Tooltip title={tooltipContent}>
        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
      </Tooltip>
    </Box>
  );
}
