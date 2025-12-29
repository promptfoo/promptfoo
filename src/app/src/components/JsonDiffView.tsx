import { useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { CopyButton } from '@app/components/ui/copy-button';
import { cn } from '@app/lib/utils';
import { computeJsonDiff, formatDiffValue, type JsonDiff } from '@app/utils/jsonDiff';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface JsonDiffViewProps {
  expected: unknown;
  actual: unknown;
  className?: string;
}

const MAX_DIFFS_SHOWN = 10;
const MAX_OBJECT_SIZE = 50_000; // 50KB limit for diff computation

/**
 * Renders a path-based summary of JSON differences with expandable full diff
 */
export function JsonDiffView({ expected, actual, className }: JsonDiffViewProps) {
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [showAllDiffs, setShowAllDiffs] = useState(false);

  const { diffs, tooLarge } = useMemo(() => {
    try {
      // Size guard for very large objects
      const expectedStr = JSON.stringify(expected);
      const actualStr = JSON.stringify(actual);

      if (expectedStr.length > MAX_OBJECT_SIZE || actualStr.length > MAX_OBJECT_SIZE) {
        return { diffs: [], tooLarge: true };
      }

      return { diffs: computeJsonDiff(expected, actual), tooLarge: false };
    } catch {
      // Handle circular references or other stringify errors
      return { diffs: [], tooLarge: true };
    }
  }, [expected, actual]);

  // Don't render if no differences found or objects are identical
  if (!tooLarge && diffs.length === 0) {
    return null;
  }

  const displayedDiffs = showAllDiffs ? diffs : diffs.slice(0, MAX_DIFFS_SHOWN);
  const hiddenCount = diffs.length - MAX_DIFFS_SHOWN;

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3',
        className,
      )}
    >
      {tooLarge ? (
        <div className="text-sm text-muted-foreground">
          Objects too large for diff view. Use the copy buttons to compare manually.
        </div>
      ) : (
        <>
          {/* Summary header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {diffs.length} difference{diffs.length !== 1 ? 's' : ''} found
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Copy:</span>
              <CopyButton
                value={JSON.stringify(expected, null, 2)}
                className="text-xs"
                iconSize="h-3 w-3"
              />
              <span className="text-xs text-muted-foreground">expected</span>
              <CopyButton
                value={JSON.stringify(actual, null, 2)}
                className="text-xs"
                iconSize="h-3 w-3"
              />
              <span className="text-xs text-muted-foreground">actual</span>
            </div>
          </div>

          {/* Path-based diff list */}
          <div className="space-y-1 font-mono text-xs">
            {displayedDiffs.map((diff, index) => (
              <DiffRow key={`${diff.path}-${index}`} diff={diff} />
            ))}

            {/* Show more button */}
            {!showAllDiffs && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllDiffs(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ...and {hiddenCount} more difference{hiddenCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Expandable full diff */}
          <Collapsible open={showFullDiff} onOpenChange={setShowFullDiff} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showFullDiff ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Hide full diff
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    View full diff
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded border border-border bg-muted/30 p-3 overflow-auto max-h-80">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words m-0">
                  <UnifiedDiff expected={expected} actual={actual} />
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}

/**
 * Renders a single diff row with path, expected, and actual values
 */
function DiffRow({ diff }: { diff: JsonDiff }) {
  const { path, expected, actual, type } = diff;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-0.5">
      <span className="text-muted-foreground min-w-[100px] shrink-0">{path}</span>
      {type === 'added' ? (
        <span className="text-green-600 dark:text-green-400">added: {formatDiffValue(actual)}</span>
      ) : type === 'removed' ? (
        <span className="text-red-600 dark:text-red-400">removed: {formatDiffValue(expected)}</span>
      ) : (
        <>
          <span className="text-red-600 dark:text-red-400">
            expected: {formatDiffValue(expected)}
          </span>
          <span className="text-green-600 dark:text-green-400">
            actual: {formatDiffValue(actual)}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Renders a unified diff view showing the full JSON with highlighted changes
 */
function UnifiedDiff({ expected, actual }: { expected: unknown; actual: unknown }) {
  // For the unified view, we'll show the actual JSON with annotations
  const expectedStr = JSON.stringify(expected, null, 2);
  const actualStr = JSON.stringify(actual, null, 2);

  // Simple line-by-line diff visualization
  const expectedLines = expectedStr.split('\n');
  const actualLines = actualStr.split('\n');

  // Build a simple unified view
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const unifiedLines: { type: 'same' | 'removed' | 'added'; content: string }[] = [];

  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i];
    const actLine = actualLines[i];

    if (expLine === actLine) {
      if (expLine !== undefined) {
        unifiedLines.push({ type: 'same', content: expLine });
      }
    } else {
      if (expLine !== undefined) {
        unifiedLines.push({ type: 'removed', content: expLine });
      }
      if (actLine !== undefined) {
        unifiedLines.push({ type: 'added', content: actLine });
      }
    }
  }

  return (
    <>
      {unifiedLines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'px-1 -mx-1',
            line.type === 'removed' &&
              'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
            line.type === 'added' &&
              'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
          )}
        >
          <span className="select-none text-muted-foreground mr-2">
            {line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' '}
          </span>
          {line.content}
        </div>
      ))}
    </>
  );
}
