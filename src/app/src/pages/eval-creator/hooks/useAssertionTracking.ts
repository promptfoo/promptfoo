import { useState, useCallback, useEffect } from 'react';
import type { Assertion } from '@promptfoo/types';

/**
 * Custom hook to track generated assertions and their edit status
 * Handles the complex logic of tracking which assertions were generated
 * and which have been edited by the user
 */
export function useAssertionTracking(
  initialAssertions: Assertion[],
  generatedAssertions: Assertion[],
) {
  const [generatedIndices, setGeneratedIndices] = useState<Set<number>>(new Set());
  const [hasBeenEdited, setHasBeenEdited] = useState<Set<number>>(new Set());

  // Reset when initialAssertions changes
  useEffect(() => {
    setGeneratedIndices(new Set());
    setHasBeenEdited(new Set());
  }, [initialAssertions]);

  // Track which assertions are generated when generatedAssertions changes
  useEffect(() => {
    if (generatedAssertions.length > 0) {
      const newGeneratedIndices = new Set<number>();

      // Find indices of generated assertions by comparing with current assertions
      generatedAssertions.forEach((genAssertion) => {
        const index = initialAssertions.findIndex(
          (assertion) =>
            assertion.type === genAssertion.type &&
            JSON.stringify(assertion.value) === JSON.stringify(genAssertion.value),
        );
        if (index !== -1) {
          newGeneratedIndices.add(index);
        }
      });

      setGeneratedIndices(newGeneratedIndices);
    }
  }, [generatedAssertions, initialAssertions]);

  const markAsEdited = useCallback(
    (index: number) => {
      if (generatedIndices.has(index)) {
        setGeneratedIndices((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        setHasBeenEdited((prev) => new Set(prev).add(index));
      }
    },
    [generatedIndices],
  );

  const isGenerated = useCallback(
    (index: number) => generatedIndices.has(index),
    [generatedIndices],
  );

  const wasEdited = useCallback((index: number) => hasBeenEdited.has(index), [hasBeenEdited]);

  return {
    generatedIndices,
    hasBeenEdited,
    markAsEdited,
    isGenerated,
    wasEdited,
  };
}
