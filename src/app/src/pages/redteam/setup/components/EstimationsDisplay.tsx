import Stack from '@mui/material/Stack';
import EstimatedDurationDisplay from './EstimatedDurationDisplay';
import EstimatedProbesDisplay from './EstimatedProbesDisplay';

import type { Config } from '../types';

interface EstimationsDisplayProps {
  config: Config;
}

/**
 * Displays the estimated duration and number of probes for the given configuration.
 */
export default function EstimationsDisplay({ config }: EstimationsDisplayProps) {
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
      <EstimatedDurationDisplay config={config} />
      <EstimatedProbesDisplay config={config} />
    </Stack>
  );
}
