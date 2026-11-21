import { memo, useMemo, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { CopyButton } from '@app/components/ui/copy-button';
import { cn } from '@app/lib/utils';
import {
  buildUnifiedJsonTextDiff,
  computeJsonDiff,
  formatDiffValue,
  type JsonDiff,
} from '@app/utils/jsonDiff';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface JsonDiffViewProps {
  comparison: { expected: string; actual: string };
  className?: string;
}

const MAX_DIFFS_SHOWN = 10;
const MAX_OBJECT_SIZE = 20_000;

type DiffResult =
  | { status: 'ready'; diffs: JsonDiff[]; expectedJson: string; actualJson: string }
  | { status: 'too-large' | 'unsupported' };

export function JsonDiffView({ comparison, className }: JsonDiffViewProps) {
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [showAllDiffs, setShowAllDiffs] = useState(false);

  const diffResult = useMemo<DiffResult>(() => {
    try {
      const { expected: expectedJson, actual: actualJson } = comparison;
      if (typeof expectedJson !== 'string' || typeof actualJson !== 'string') {
        return { status: 'unsupported' };
      }
      if (expectedJson.length > MAX_OBJECT_SIZE || actualJson.length > MAX_OBJECT_SIZE) {
        return { status: 'too-large' };
      }
      const expected = JSON.parse(expectedJson);
      const actual = JSON.parse(actualJson);

      return {
        status: 'ready',
        diffs: computeJsonDiff(expected, actual),
        expectedJson,
        actualJson,
      };
    } catch {
      return { status: 'unsupported' };
    }
  }, [comparison]);

  if (diffResult.status === 'ready' && diffResult.diffs.length === 0) {
    return null;
  }

  const diffs = diffResult.status === 'ready' ? diffResult.diffs : [];
  const displayedDiffs = showAllDiffs ? diffs : diffs.slice(0, MAX_DIFFS_SHOWN);
  const hiddenCount = diffs.length - MAX_DIFFS_SHOWN;

  return (
    <div
      className={cn(
        'mt-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3',
        className,
      )}
    >
      {diffResult.status === 'ready' ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {diffs.length} difference{diffs.length === 1 ? '' : 's'} found
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Copy:</span>
              <CopyButton
                value={diffResult.expectedJson}
                className="text-xs"
                iconSize="h-3 w-3"
                aria-label="Copy expected JSON"
              />
              <span className="text-xs text-muted-foreground">expected</span>
              <CopyButton
                value={diffResult.actualJson}
                className="text-xs"
                iconSize="h-3 w-3"
                aria-label="Copy actual JSON"
              />
              <span className="text-xs text-muted-foreground">actual</span>
            </div>
          </div>
          <div className="space-y-1 font-mono text-xs">
            {displayedDiffs.map((diff, index) => (
              <DiffRow key={`${diff.path}-${index}`} diff={diff} />
            ))}
            {!showAllDiffs && hiddenCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllDiffs(true)}
                className="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                ...and {hiddenCount} more difference{hiddenCount === 1 ? '' : 's'}
              </Button>
            )}
          </div>
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
                <div
                  className="text-xs font-mono whitespace-pre-wrap break-words"
                  data-testid="json-unified-diff"
                >
                  <UnifiedDiff
                    expectedJson={diffResult.expectedJson}
                    actualJson={diffResult.actualJson}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          {diffResult.status === 'too-large'
            ? 'JSON values exceed the diff view size limit. Compare the expected and actual values manually.'
            : 'JSON diff view is unavailable for these values.'}
        </div>
      )}
    </div>
  );
}

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

const UnifiedDiff = memo(function UnifiedDiff({
  expectedJson,
  actualJson,
}: {
  expectedJson: string;
  actualJson: string;
}) {
  const unifiedLines = useMemo(
    () => buildUnifiedJsonTextDiff(expectedJson, actualJson),
    [expectedJson, actualJson],
  );

  if (!unifiedLines) {
    return <p>The full diff is too large to display. Use the summary or copy the JSON values.</p>;
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
});
