import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';
import { estimateProbeRange } from './strategies/utils';

import type { Config } from '../types';

interface EstimatedProbesDisplayProps {
  config: Config;
  tooltipContent?: string;
  className?: string;
}

const DEFAULT_TOOLTIP =
  'Probes are the number of requests to the target application. ' +
  'This is calculated based on your selected plugins, strategies, and number of test cases.';

export default function EstimatedProbesDisplay({
  config,
  tooltipContent = DEFAULT_TOOLTIP,
  className,
}: EstimatedProbesDisplayProps) {
  const probeEstimate = useMemo(() => estimateProbeRange(config), [config]);
  const likelyProbes = probeEstimate.likely;
  const estimateDrivers = probeEstimate.assumptions;

  return (
    <div className={cn('mb-6 rounded-lg border border-border p-4', className)}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Estimated Probes:</span>
        <span className="font-bold text-primary">{likelyProbes.toLocaleString()}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="size-4 cursor-help text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Likely: {probeEstimate.likely.toLocaleString()} | Range:{' '}
        {probeEstimate.min.toLocaleString()} - {probeEstimate.max.toLocaleString()} | Ceiling:{' '}
        {probeEstimate.ceiling.toLocaleString()}
      </p>
      {estimateDrivers.length > 0 && (
        <div className="mt-1">
          <p className="text-xs font-medium text-muted-foreground">Estimate drivers:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {estimateDrivers.map((driver, index) => (
              <li key={`${driver}-${index}`}>{driver}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
