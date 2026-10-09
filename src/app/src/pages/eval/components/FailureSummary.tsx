import { useEffect, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { useTableStore } from './store';
import type { GetFailureSummaryResponse } from '@promptfoo/types/api/eval';

interface FailureSummaryProps {
  evalId: string;
  onSelect: () => void;
}

function useFailureSummary(evalId: string) {
  const table = useTableStore((state) => state.table);
  const [summary, setSummary] = useState<GetFailureSummaryResponse | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: table changes signal streamed results and manual ratings.
  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    async function load() {
      try {
        const response = await callApi(`/eval/${encodeURIComponent(evalId)}/failure-summary`, {
          signal: controller.signal,
        });
        const data = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) {
          setSummary(Array.isArray(data?.failures) ? data : null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSummary(null);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [evalId, table]);

  return summary;
}

export function FailureSummary({ evalId, onSelect }: FailureSummaryProps) {
  const summary = useFailureSummary(evalId);
  const { addFilter, filters, removeFilter } = useTableStore();
  if (!summary?.failures.length) {
    return null;
  }
  const selectedGroups = Object.values(filters.values).filter((filter) => filter.type === 'error');

  const selectGroup = ({ id, error }: GetFailureSummaryResponse['failures'][number]) => {
    const wasSelected = selectedGroups.some((filter) => filter.value === id);
    // One group at a time avoids contradictory AND predicates and preserves other filters.
    selectedGroups.forEach((filter) => removeFilter(filter.id));
    if (!wasSelected) {
      onSelect();
      addFilter({ type: 'error', operator: 'equals', value: id, label: error });
    }
  };

  return (
    <section aria-label="Failure groups" className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Select a failure group to show rows containing it. Other comparison outputs remain visible.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {summary.failures.map((failure) => {
          const isActive = selectedGroups.some((filter) => filter.value === failure.id);
          return (
            <Tooltip key={failure.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${failure.count} ${failure.count === 1 ? 'failure' : 'failures'}: ${failure.error}`}
                  onClick={() => selectGroup(failure)}
                >
                  <Badge
                    variant="secondary"
                    className={
                      isActive
                        ? 'max-w-xs cursor-pointer bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'max-w-xs cursor-pointer hover:bg-muted'
                    }
                  >
                    <span className="truncate">
                      {failure.count} · {failure.error}
                    </span>
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-md break-words">
                <p className="text-sm">{failure.error}</p>
                <p className="text-xs">
                  {isActive ? 'Remove group filter' : 'Show rows with this failure'}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {summary.hasMore && (
        <p className="text-xs text-muted-foreground">
          Showing the 100 most frequent failure groups.
        </p>
      )}
    </section>
  );
}
