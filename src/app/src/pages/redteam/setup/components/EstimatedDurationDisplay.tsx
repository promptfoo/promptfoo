import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Info } from 'lucide-react';
import { getEstimatedDuration } from './strategies/utils';

import type { Config } from '../types';

interface EstimatedDurationDisplayProps {
  config: Config;
}

export default function EstimatedDurationDisplay({ config }: EstimatedDurationDisplayProps) {
  return (
    <div className="mb-6 flex items-center gap-2 rounded-lg border border-border p-4">
      <span className="text-muted-foreground">Estimated Duration:</span>
      <span className="font-bold text-primary">{getEstimatedDuration(config)}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-4 cursor-help text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          Estimated time includes test generation and probe execution. Actual time may vary based on
          target response times and network conditions.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
