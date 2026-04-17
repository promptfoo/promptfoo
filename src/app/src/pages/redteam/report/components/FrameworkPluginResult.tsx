import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { formatASRForDisplay } from '@app/utils/redteam';
import { riskCategorySeverityMap, Severity } from '@promptfoo/redteam/constants';
import { CheckCircle, Info, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPluginDisplayName } from './FrameworkComplianceUtils';

export interface FrameworkPluginResultProps {
  evalId: string;
  plugin: string;
  getPluginASR: (plugin: string) => { asr: number; total: number; failCount: number };
  type: 'failed' | 'passed' | 'untested';
}

// Maps severity to Tailwind border colors
const severityBorderStyles: Record<Severity, string> = {
  [Severity.Critical]: 'border-l-red-800',
  [Severity.High]: 'border-l-red-500',
  [Severity.Medium]: 'border-l-amber-500',
  [Severity.Low]: 'border-l-emerald-500',
  [Severity.Informational]: 'border-l-blue-500',
};

export default function FrameworkPluginResult({
  evalId,
  plugin,
  getPluginASR,
  type,
}: FrameworkPluginResultProps) {
  const navigate = useNavigate();

  const handlePluginClick = (pluginId: string) => {
    const { asr } = getPluginASR(plugin);

    const filterParam = encodeURIComponent(
      JSON.stringify([
        {
          type: 'plugin',
          operator: 'equals',
          value: pluginId,
        },
      ]),
    );

    const mode = asr === 0 ? 'passes' : 'failures';
    navigate(`${EVAL_ROUTES.DETAIL(evalId)}?filter=${filterParam}&mode=${mode}`);
  };

  const { asr, total, failCount } = getPluginASR(plugin);

  const pluginSeverity =
    riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;

  return (
    <div
      className={cn(
        'mb-0.5 flex items-center gap-2 rounded-r border-l-[3px] bg-black/[0.02] py-2 pl-2 pr-3 dark:bg-white/[0.02]',
        severityBorderStyles[pluginSeverity],
        type === 'untested' && 'opacity-70',
      )}
    >
      <div className="flex w-5 shrink-0 items-center justify-center">
        {type === 'failed' && <XCircle className="size-4 text-destructive" />}
        {type === 'passed' && (
          <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-500" />
        )}
        {type === 'untested' && <Info className="size-4 text-muted-foreground" />}
      </div>
      <div className="flex flex-1 items-center justify-between">
        <span
          className={cn('text-sm', type !== 'untested' && 'cursor-pointer hover:underline')}
          onClick={() => type !== 'untested' && handlePluginClick(plugin)}
        >
          {getPluginDisplayName(plugin)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'text-xs',
                type === 'failed' && 'font-bold text-destructive',
                type === 'passed' && 'font-bold text-emerald-600 dark:text-emerald-500',
                type === 'untested' && 'font-semibold text-muted-foreground',
              )}
              aria-label={`${failCount}/${total} attacks successful`}
            >
              {type === 'untested' ? 'Not Tested' : `${formatASRForDisplay(asr)}%`}
            </span>
          </TooltipTrigger>
          <TooltipContent>{`${failCount}/${total} attacks successful`}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
