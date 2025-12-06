import { useMemo } from 'react';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import type { Config } from '../types';
import EstimatedDurationDisplay from './EstimatedDurationDisplay';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';
import { getEstimatedProbes } from './strategies/utils';

interface EstimationsDisplayProps {
  config: Config;
  compact?: boolean;
}

/**
 * Displays the estimated duration and number of probes for the given configuration.
 */
export default function EstimationsDisplay({ config, compact }: EstimationsDisplayProps) {
  const estimatedProbes = useMemo(() => getEstimatedProbes(config), [config]);

  if (compact) {
    return (
      <Chip
        label={`~${estimatedProbes.toLocaleString()} probes`}
        size="small"
        sx={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          color: 'inherit',
          fontWeight: 500,
        }}
      />
    );
  }

  return (
    <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
      <EstimatedDurationDisplay config={config} />
      <EstimatedProbesDisplay config={config} />
    </Stack>
  );
}
