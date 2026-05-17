import { useContext } from 'react';

import { EvalHistoryContext } from '@app/contexts/EvalHistoryContextDef';

export const useEvalHistoryRefresh = () => {
  const context = useContext(EvalHistoryContext);
  if (context === undefined) {
    throw new Error('useEvalHistoryRefresh must be used within an EvalHistoryProvider');
  }
  return context;
};
