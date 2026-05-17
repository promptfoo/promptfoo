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
    <div className="flex flex-col gap-4 sm:flex-row">
      <EstimatedDurationDisplay config={config} />
      <EstimatedProbesDisplay config={config} />
    </div>
  );
}
