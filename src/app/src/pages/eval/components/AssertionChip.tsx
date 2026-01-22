import * as React from 'react';
import { Check, ChevronDown, Minus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@app/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
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
  tooltipContent?: React.ReactNode;
  /** Click handler for filtering */
  onClick?: () => void;
}

function getThresholdLabel(threshold: number | undefined): string {
  if (threshold === undefined) {
    return '';
  }
  if (threshold === 1) {
    return 'ALL must pass';
  }
  if (threshold > 0 && threshold < 1) {
    return 'Either/Or';
  }
  return `≥${(threshold * 100).toFixed(0)}%`;
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

  // Format score for display
  // Hide boolean scores (0 and 1) and hide score for assert-sets (shown in popover with context)
  const displayScore = !isAssertSet && score !== 0 && score !== 1 ? score.toFixed(2) : null;

  // Popover content for assert-sets
  const popoverContent =
    isAssertSet && childResults && childResults.length > 0 ? (
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
              {passed ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
              ) : (
                <X className="size-3.5 text-red-600 dark:text-red-400 stroke-[2.5]" />
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Child assertions */}
          <div className="space-y-2">
            {childResults.map((child, index) => {
              const childMetric =
                child.assertion?.metric || child.assertion?.type || `assertion-${index}`;
              const childScore = child.score;
              const childPassed = child.pass;

              // Determine status indicator
              // If parent passed (e.g., Either/Or), show neutral for failed children
              const showNeutral = passed && !childPassed;

              return (
                <div key={index} className="flex items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    {showNeutral ? (
                      <Minus className="size-3.5 text-muted-foreground" />
                    ) : childPassed ? (
                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                    ) : (
                      <X className="size-3.5 text-red-600 dark:text-red-400 stroke-[2.5]" />
                    )}
                    <span className={cn(showNeutral && 'text-muted-foreground')}>{childMetric}</span>
                  </div>
                  <span
                    className={cn('font-medium', showNeutral && 'text-muted-foreground opacity-80')}
                  >
                    {childScore.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    ) : null;

  // Main chip content (without chevron for assert-sets)
  const chipMainContent = (
    <>
      {passed ? (
        <Check className="size-3.5 stroke-[2.5]" />
      ) : (
        <X className="size-3.5 stroke-[2.5]" />
      )}
      <span className="font-semibold">{metric}</span>
      {displayScore && <span className="opacity-80">{displayScore}</span>}
    </>
  );

  // For assert-sets with children, use split click targets
  if (isAssertSet && childResults && childResults.length > 0) {
    const chipContent = (
      <div className={chipClasses}>
        {/* Main area - click to filter */}
        <div className="inline-flex items-center gap-1.5" onClick={onClick}>
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

    // Wrap in tooltip if tooltipContent provided
    if (tooltipContent) {
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
    <div className={chipClasses} onClick={onClick}>
      {chipMainContent}
    </div>
  );

  // Wrap in tooltip if tooltipContent provided
  if (tooltipContent) {
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
export { AssertionChip, getThresholdLabel };
export type { AssertionChipProps };
