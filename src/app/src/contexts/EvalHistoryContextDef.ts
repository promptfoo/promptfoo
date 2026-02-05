import { createContext } from 'react';

export interface EvalHistoryContextValue {
  /**
   * Timestamp of the last eval completion.
   * Changes to this value signal that history should be refetched.
   */
  lastEvalCompletedAt: number | null;
  /**
   * Signal that a new eval has completed and history should be refreshed.
   */
  signalEvalCompleted: () => void;
}

export const EvalHistoryContext = createContext<EvalHistoryContextValue | undefined>(undefined);
