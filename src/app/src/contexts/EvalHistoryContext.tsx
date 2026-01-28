import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { EvalHistoryContext } from './EvalHistoryContextDef';

export const EvalHistoryProvider = ({ children }: { children: ReactNode }) => {
  const [lastEvalCompletedAt, setLastEvalCompletedAt] = useState<number | null>(null);

  const signalEvalCompleted = useCallback(() => {
    setLastEvalCompletedAt(Date.now());
  }, []);

  const value = useMemo(
    () => ({ lastEvalCompletedAt, signalEvalCompleted }),
    [lastEvalCompletedAt, signalEvalCompleted],
  );

  return <EvalHistoryContext value={value}>{children}</EvalHistoryContext>;
};
