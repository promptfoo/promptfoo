import { createContext, useContext } from 'react';
import type { EvalResultsFilterMode } from '@promptfoo/types';
import { useSearchParamState } from '@app/hooks/useSearchParamState';
import { z } from 'zod';

export const DEFAULT_FILTER_MODE = 'all';

const filterModeSchema = z.enum(['all', 'passes', 'failures', 'errors', 'different', 'highlights']);

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
  return (
    <FilterModeContext
      value={{
        filterMode: filterMode ?? DEFAULT_FILTER_MODE,
        setFilterMode,
      }}
    >
      {children}
    </FilterModeContext>
  );
}
