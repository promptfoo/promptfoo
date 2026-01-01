import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';
import { getEstimatedProbes } from './strategies/utils';

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
  const estimatedProbes = useMemo(() => getEstimatedProbes(config), [config]);

  return (
    <div
      className={cn('mb-6 flex items-center gap-2 rounded-lg border border-border p-4', className)}
    >
      <span className="text-muted-foreground">Estimated Probes:</span>
      <span className="font-bold text-primary">{estimatedProbes.toLocaleString()}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-4 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </div>
  );
}
