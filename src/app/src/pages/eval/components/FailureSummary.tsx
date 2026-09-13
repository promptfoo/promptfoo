import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { AlertCircle } from 'lucide-react';
import { useTableStore } from './store';

interface FailureSummaryProps {
  evalId: string;
}

type FailureSummaryResponse = {
  failures: Array<{ error: string; count: number }>;
};

export function FailureSummary({ evalId }: FailureSummaryProps) {
  const { addFilter, filters, removeFilter } = useTableStore();
  const [failures, setFailures] = useState<FailureSummaryResponse['failures']>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFailureSummary() {
      try {
        const response = await callApi(`/eval/${encodeURIComponent(evalId)}/failure-summary`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setFailures([]);
          return;
        }
        const data = (await response.json()) as Partial<FailureSummaryResponse> | null;
        setFailures(Array.isArray(data?.failures) ? data.failures : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setFailures([]);
        }
      }
    }

    void loadFailureSummary();
    return () => controller.abort();
  }, [evalId]);

  const activeFilterIds = useMemo(
    () =>
      new Map(
        Object.entries(filters.values)
          .filter(([, filter]) => filter.type === 'error' && filter.operator === 'equals')
          .map(([id, filter]) => [filter.value, id]),
      ),
    [filters.values],
  );

  if (failures.length === 0) {
    return null;
  }

  const toggleFailureFilter = (error: string) => {
    const activeFilterId = activeFilterIds.get(error);
    if (activeFilterId) {
      removeFilter(activeFilterId);
      return;
    }
    addFilter({
      type: 'error',
      operator: 'equals',
      value: error,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Failure groups:</span>
      {failures.map(({ error, count }) => {
        const isActive = activeFilterIds.has(error);
        return (
          <Tooltip key={error}>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => toggleFailureFilter(error)}>
                <Badge
                  variant="secondary"
                  className={
                    isActive
                      ? 'cursor-pointer bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                      : 'cursor-pointer hover:bg-muted'
                  }
                >
                  <AlertCircle className="mr-1 size-3 text-red-500" />
                  {count} {count === 1 ? 'failure' : 'failures'}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-md break-words">
              {error}
              <br />
              {isActive ? 'Click to remove filter' : 'Click to filter'}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
