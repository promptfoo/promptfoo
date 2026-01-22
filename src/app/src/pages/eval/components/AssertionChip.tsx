import type { ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { getThresholdLabel } from '@app/utils/assertSetThreshold';
import { Check, ChevronDown, Minus, X } from 'lucide-react';
import type { GradingResult } from '@promptfoo/types';

interface AssertionChipProps {
  /** The metric name to display */
  metric: string;
  /** The score value (0-1) */
  score: number;
  /** Whether the assertion passed */
  passed: boolean;
  /** Whether this is an assert-set with children */
  isAssertSet?: boolean;
  /** Threshold value for assert-sets */
  threshold?: number;
  /** Label describing the threshold type (e.g., "Either/Or", "ALL must pass") */
  thresholdLabel?: string;
  /** Child assertion results for assert-sets */
  childResults?: GradingResult[];
  /** Optional tooltip content (e.g., for policy metrics) */
  tooltipContent?: ReactNode;
  /** Click handler for filtering */
  onClick?: () => void;
}

/** Get a stable key for a child result */
function getChildKey(child: GradingResult, index: number): string {
  return child.assertion?.metric || child.assertion?.type || `assertion-${index}`;
}

/** Status icon for pass/fail/neutral states */
function StatusIcon({ passed, neutral }: { passed: boolean; neutral: boolean }) {
  if (neutral) {
    return <Minus className="size-3.5 text-muted-foreground" aria-hidden="true" />;
  }
  if (passed) {
    return (
      <Check
        className="size-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]"
        aria-hidden="true"
      />
    );
  }
  return <X className="size-3.5 text-red-600 dark:text-red-400 stroke-[2.5]" aria-hidden="true" />;
}

function AssertionChip({
  metric,
  score,
  passed,
  isAssertSet = false,
  threshold,
  thresholdLabel,
  childResults,
  tooltipContent,
  onClick,
}: AssertionChipProps) {
  const chipClasses = cn(
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer',
    passed
      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50'
      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50',
  );

  const displayThresholdLabel = thresholdLabel ?? getThresholdLabel(threshold);
  const hasChildren = isAssertSet && childResults && childResults.length > 0;

  // Hide boolean scores (0 and 1) and hide score for assert-sets (shown in popover)
  const displayScore = !isAssertSet && score !== 0 && score !== 1 ? score.toFixed(2) : null;

  // Main chip content
  const chipMainContent = (
    <>
      {passed ? (
        <Check className="size-3.5 stroke-[2.5]" aria-hidden="true" />
      ) : (
        <X className="size-3.5 stroke-[2.5]" aria-hidden="true" />
      )}
      <span className="font-semibold">{metric}</span>
      {displayScore && <span className="opacity-80">{displayScore}</span>}
    </>
  );

  // Popover content for assert-sets with children
  const popoverContent = hasChildren ? (
    <PopoverContent className="w-auto min-w-[240px] p-3" align="start">
      <div className="space-y-3">
        {/* Header */}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{metric}</h4>
          {displayThresholdLabel && (
            <p className="text-xs text-muted-foreground">{displayThresholdLabel}</p>
          )}
          <div className="flex items-center gap-1.5 text-xs">
            <span>Score:</span>
            <span className="font-medium">{score.toFixed(2)}</span>
            {threshold !== undefined && (
              <>
                <span className="text-muted-foreground">≥</span>
                <span className="text-muted-foreground">{threshold.toFixed(2)}</span>
              </>
            )}
            <StatusIcon passed={passed} neutral={false} />
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Child assertions */}
        <div className="space-y-2">
          {childResults!.map((child, index) => {
            const childMetric = getChildKey(child, index);
            const childPassed = child.pass;
            // Show neutral for failed children when parent passed (e.g., Either/Or)
            const showNeutral = passed && !childPassed;

            return (
              <div
                key={childMetric}
                className="flex items-center justify-between gap-4 text-sm"
                data-testid={`child-assertion-${childMetric}`}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon passed={childPassed} neutral={showNeutral} />
                  <span className={cn(showNeutral && 'text-muted-foreground')}>{childMetric}</span>
                </div>
                <span
                  className={cn('font-medium', showNeutral && 'text-muted-foreground opacity-80')}
                >
                  {child.score.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </PopoverContent>
  ) : null;

  // Assert-set chip with expandable popover
  if (hasChildren) {
    const chipContent = (
      <div className={chipClasses} data-testid={`assertion-chip-${metric}`}>
        {/* Main area - click to filter */}
        <div
          className="inline-flex items-center gap-1.5"
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
        >
          {chipMainContent}
        </div>
        {/* Chevron - click to open popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded p-0.5 -mr-1 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Show ${metric} details`}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </PopoverTrigger>
          {popoverContent}
        </Popover>
      </div>
    );

    if (tooltipContent != null) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{chipContent}</TooltipTrigger>
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      );
    }

    return chipContent;
  }

  // Standalone chip (no popover)
  const standaloneChip = (
    <div
      className={chipClasses}
      onClick={onClick}
      data-testid={`assertion-chip-${metric}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {chipMainContent}
    </div>
  );

  if (tooltipContent != null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{standaloneChip}</TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  return standaloneChip;
}

export default AssertionChip;
export { AssertionChip };

export { getThresholdLabel } from '@app/utils/assertSetThreshold';
export type { AssertionChipProps };
