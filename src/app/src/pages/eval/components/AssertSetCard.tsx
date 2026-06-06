import { useId, useState } from 'react';

import { cn } from '@app/lib/utils';
import { formatScoreThreshold, getThresholdLabel } from '@app/utils/assertSetThreshold';
import { ChevronDown, CircleCheck, CircleX, Minus } from 'lucide-react';

import type { AssertionHierarchyResult } from './assertionHierarchy';

interface AssertSetCardProps {
  result: AssertionHierarchyResult;
  children: AssertionHierarchyResult[];
  defaultExpanded?: boolean;
}

function getChildResults(result: AssertionHierarchyResult): AssertionHierarchyResult[] {
  return (
    result.componentResults?.filter((childResult): childResult is AssertionHierarchyResult =>
      Boolean(childResult),
    ) ?? []
  );
}

function AssertionRow({
  result,
  parentPassed,
  isChild = false,
}: {
  result: AssertionHierarchyResult;
  parentPassed?: boolean;
  isChild?: boolean;
}) {
  // Determine pass/fail indicator
  const passed = result.pass;
  const isNeutral = !passed && parentPassed && isChild;

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-3 text-sm',
        isChild && 'pl-8 border-l-2 border-border ml-3',
      )}
    >
      {/* Pass/Fail indicator */}
      <div className="flex-shrink-0">
        {passed ? (
          <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : isNeutral ? (
          <Minus className="size-4 text-muted-foreground" />
        ) : (
          <CircleX className="size-4 text-red-600 dark:text-red-400" />
        )}
      </div>

      {/* Metric name */}
      <span
        className={cn(
          'font-medium min-w-[120px]',
          !passed && !isNeutral && 'text-red-700 dark:text-red-300',
        )}
      >
        {result.assertion?.metric ||
          result.metadata?.assertSetMetric ||
          result.assertion?.type ||
          'assertion'}
      </span>

      {/* Score */}
      <span className="text-muted-foreground tabular-nums min-w-[60px]">
        {result.score?.toFixed(2)}
      </span>

      {/* Reason */}
      <span
        className={cn('text-muted-foreground flex-1', isNeutral && 'italic')}
        title={result.reason}
      >
        {result.reason}
        {isNeutral && ' (not required - parent passed)'}
      </span>
    </div>
  );
}

export function AssertSetCard({ result, children, defaultExpanded }: AssertSetCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? !result.pass);
  const childrenId = useId();
  const hasChildren = children.length > 0;

  const threshold = result.metadata?.assertSetThreshold ?? result.assertion?.threshold;
  const thresholdLabel = getThresholdLabel(threshold);

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        result.pass
          ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20'
          : 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20',
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-controls={hasChildren ? childrenId : undefined}
        aria-expanded={hasChildren ? isExpanded : undefined}
        disabled={!hasChildren}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left',
          hasChildren && 'hover:bg-muted/30 transition-colors',
        )}
      >
        {/* Pass/Fail indicator */}
        <div className="flex-shrink-0">
          {result.pass ? (
            <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CircleX className="size-5 text-red-600 dark:text-red-400" />
          )}
        </div>

        {/* Metric name and threshold label */}
        <div className="flex-1">
          <span className="font-medium">
            {result.assertion?.metric || result.metadata?.assertSetMetric || 'assert-set'}
            {thresholdLabel && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({thresholdLabel})
              </span>
            )}
          </span>
        </div>

        {/* Score vs threshold */}
        <span
          className={cn(
            'text-sm tabular-nums',
            result.pass
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-red-700 dark:text-red-300',
          )}
        >
          {formatScoreThreshold(result.score, threshold)}
        </span>

        {/* Expand/collapse chevron */}
        {hasChildren && (
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              isExpanded && 'rotate-180',
            )}
          />
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div id={childrenId} className="border-t border-border bg-background/50">
          {children.map((child, index) => {
            const nestedChildren = getChildResults(child);
            if (child.metadata?.isAssertSet || nestedChildren.length > 0) {
              return (
                <div key={index} className="ml-3 border-l-2 border-border py-2 pl-5 pr-3">
                  <AssertSetCard
                    result={child}
                    children={nestedChildren}
                    defaultExpanded={!child.pass}
                  />
                </div>
              );
            }

            return (
              <AssertionRow key={index} result={child} parentPassed={result.pass} isChild={true} />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AssertSetCard;
