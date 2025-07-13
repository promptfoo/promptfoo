import { useMemo } from 'react';

/**
 * Custom hook to normalize prompts from various formats to string array
 * Handles both string prompts and prompt objects with 'raw' property
 */
export function usePromptNormalization(prompts: unknown[]): string[] {
  return useMemo(() => {
    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        } else if (prompt && typeof prompt === 'object' && 'raw' in prompt) {
          return (prompt as { raw: string }).raw;
        }
        return '';
      })
      .filter((p) => p !== '');
  }, [prompts]);
}