import { useState, useCallback } from 'react';
import type { GenerationBatch } from '../types';

/**
 * Custom hook to manage generation batches
 * Provides methods to store, retrieve, and manage generation batch metadata
 */
export function useGenerationBatches() {
  const [batches, setBatches] = useState<Map<string, GenerationBatch>>(new Map());

  const addBatch = useCallback((batch: GenerationBatch) => {
    setBatches((prev) => {
      const newBatches = new Map(prev);
      newBatches.set(batch.id, batch);
      return newBatches;
    });
  }, []);

  const getBatch = useCallback(
    (batchId: string): GenerationBatch | undefined => {
      return batches.get(batchId);
    },
    [batches],
  );

  const removeBatch = useCallback((batchId: string) => {
    setBatches((prev) => {
      const newBatches = new Map(prev);
      newBatches.delete(batchId);
      return newBatches;
    });
  }, []);

  const clearBatches = useCallback(() => {
    setBatches(new Map());
  }, []);

  return {
    batches,
    addBatch,
    getBatch,
    removeBatch,
    clearBatches,
  };
}
