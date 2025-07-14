import { useEffect, useCallback } from 'react';
import type { TestCase } from '@promptfoo/types';

const DRAFT_KEY = 'promptfoo:testcase:draft';
const DRAFT_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface DraftData {
  testCase: Partial<TestCase>;
  timestamp: number;
}

export function useTestCaseDraft() {
  const saveDraft = useCallback((testCase: Partial<TestCase>) => {
    const draft: DraftData = {
      testCase,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, []);

  const loadDraft = useCallback((): Partial<TestCase> | null => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (!stored) {
        return null;
      }

      const draft: DraftData = JSON.parse(stored);

      // Check if draft is expired
      if (Date.now() - draft.timestamp > DRAFT_EXPIRY) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }

      return draft.testCase;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  const hasDraft = useCallback((): boolean => {
    const draft = loadDraft();
    return draft !== null;
  }, [loadDraft]);

  return {
    saveDraft,
    loadDraft,
    clearDraft,
    hasDraft,
  };
}
