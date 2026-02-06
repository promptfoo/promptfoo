/**
 * DiversityScoreDisplay - Shows test case diversity metrics.
 * Features:
 * - Score with visual progress bar
 * - Label (Excellent/Good/Fair/Low)
 * - Optional breakdown details
 */
import { useMemo } from 'react';

import { Progress } from '@app/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { Info } from 'lucide-react';

import type { DiversityMetrics } from '../../api/generation';

interface DiversityScoreDisplayProps {
  diversity: DiversityMetrics | null;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Show improvement button */
  onImprove?: () => void;
}

export function DiversityScoreDisplay({
  diversity,
  compact = false,
  onImprove,
}: DiversityScoreDisplayProps) {
  const score = diversity?.score ?? 0;
  const scorePercent = Math.round(score * 100);

  const { label, colorClass, bgClass } = useMemo(() => {
    if (score >= 0.8) {
      return {
        label: 'Excellent',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        bgClass: 'bg-emerald-500',
      };
    }
    if (score >= 0.6) {
      return {
        label: 'Good',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        bgClass: 'bg-emerald-500',
      };
    }
    if (score >= 0.4) {
      return {
        label: 'Fair',
        colorClass: 'text-amber-600 dark:text-amber-400',
        bgClass: 'bg-amber-500',
      };
    }
    return {
      label: 'Low',
      colorClass: 'text-red-600 dark:text-red-400',
      bgClass: 'bg-red-500',
    };
  }, [score]);

  if (!diversity) {
    return null;
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            <span className="text-xs text-muted-foreground">Diversity:</span>
            <div className="w-16">
              <Progress value={scorePercent} className="h-1.5" />
            </div>
            <span className={cn('text-xs font-medium', colorClass)}>{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Diversity score: {scorePercent}%
            {diversity.clusters && ` • ${diversity.clusters} clusters`}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">Diversity</span>
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Diversity measures how varied your test cases are. Higher diversity means better
                coverage of different scenarios.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <span className={cn('text-sm font-medium', colorClass)}>{label}</span>
      </div>

      <div className="space-y-1">
        <Progress value={scorePercent} className={cn('h-2', `[&>div]:${bgClass}`)} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{scorePercent}%</span>
          {diversity.clusters && <span>{diversity.clusters} clusters</span>}
        </div>
      </div>

      {diversity.gaps && diversity.gaps.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Coverage gaps:</p>
          <ul className="text-xs space-y-0.5">
            {diversity.gaps.slice(0, 3).map((gap, idx) => (
              <li key={idx} className="text-muted-foreground">
                • {gap}
              </li>
            ))}
            {diversity.gaps.length > 3 && (
              <li className="text-muted-foreground">... and {diversity.gaps.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      {onImprove && score < 0.7 && (
        <button
          type="button"
          onClick={onImprove}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
        >
          Improve diversity →
        </button>
      )}
    </div>
  );
}
