import { createContext, useContext, useMemo } from 'react';

import { useSearchParamState } from '@app/hooks/useSearchParamState';
import { z } from 'zod';
import type { EvalResultsFilterMode } from '@promptfoo/types';

export const DEFAULT_FILTER_MODE = 'all';

const filterModeSchema = z.enum([
  'all',
  'passes',
  'failures',
  'errors',
  'different',
  'highlights',
  'user-rated',
]);

type FilterModeContextType = {
  filterMode: EvalResultsFilterMode;
  setFilterMode: (filterMode: EvalResultsFilterMode) => void;
};

const FilterModeContext = createContext<FilterModeContextType>({
  filterMode: DEFAULT_FILTER_MODE,
  setFilterMode: (_value: EvalResultsFilterMode) => {},
});

export const useFilterMode = () => {
  return useContext(FilterModeContext);
};

export default function FilterModeProvider({ children }: { children: React.ReactNode }) {
  const [filterMode, setFilterMode] = useSearchParamState<EvalResultsFilterMode>(
    'mode',
    filterModeSchema,
    DEFAULT_FILTER_MODE,
  );

  const value = useMemo(
    () => ({
      filterMode: filterMode ?? DEFAULT_FILTER_MODE,
      setFilterMode,
    }),
    [filterMode, setFilterMode],
  );

  return <FilterModeContext value={value}>{children}</FilterModeContext>;
}
