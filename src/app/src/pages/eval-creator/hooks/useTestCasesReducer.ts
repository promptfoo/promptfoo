import { useReducer, useCallback } from 'react';
import type { TestCase } from '@promptfoo/types';

type TestCasesState = {
  testCases: TestCase[];
  editingIndex: number | null;
  deleteIndex: number | null;
  isGenerating: boolean;
  isDeleting: boolean;
};

type TestCasesAction =
  | { type: 'SET_TEST_CASES'; payload: TestCase[] }
  | { type: 'ADD_TEST_CASE'; payload: TestCase }
  | { type: 'ADD_MULTIPLE_TEST_CASES'; payload: TestCase[] }
  | { type: 'UPDATE_TEST_CASE'; index: number; payload: TestCase }
  | { type: 'DELETE_TEST_CASE'; index: number }
  | { type: 'DUPLICATE_TEST_CASE'; index: number }
  | { type: 'SET_EDITING_INDEX'; index: number | null }
  | { type: 'SET_DELETE_INDEX'; index: number | null }
  | { type: 'SET_GENERATING'; isGenerating: boolean }
  | { type: 'SET_DELETING'; isDeleting: boolean };

function testCasesReducer(state: TestCasesState, action: TestCasesAction): TestCasesState {
  switch (action.type) {
    case 'SET_TEST_CASES':
      return { ...state, testCases: action.payload };

    case 'ADD_TEST_CASE':
      return { ...state, testCases: [...state.testCases, action.payload] };

    case 'ADD_MULTIPLE_TEST_CASES':
      return { ...state, testCases: [...state.testCases, ...action.payload] };

    case 'UPDATE_TEST_CASE': {
      const newTestCases = [...state.testCases];
      newTestCases[action.index] = action.payload;
      return { ...state, testCases: newTestCases, editingIndex: null };
    }

    case 'DELETE_TEST_CASE': {
      const newTestCases = state.testCases.filter((_, i) => i !== action.index);
      return {
        ...state,
        testCases: newTestCases,
        deleteIndex: null,
        isDeleting: false,
      };
    }

    case 'DUPLICATE_TEST_CASE': {
      const duplicated = JSON.parse(JSON.stringify(state.testCases[action.index]));
      // Remove generation metadata from duplicated test case
      if (duplicated.metadata?.generationBatchId) {
        duplicated.metadata = {
          ...duplicated.metadata,
          generationBatchId: undefined,
          duplicatedFrom: 'generated',
          duplicatedAt: new Date().toISOString(),
        };
      }
      return { ...state, testCases: [...state.testCases, duplicated] };
    }

    case 'SET_EDITING_INDEX':
      return { ...state, editingIndex: action.index };

    case 'SET_DELETE_INDEX':
      return { ...state, deleteIndex: action.index };

    case 'SET_GENERATING':
      return { ...state, isGenerating: action.isGenerating };

    case 'SET_DELETING':
      return { ...state, isDeleting: action.isDeleting };

    default:
      return state;
  }
}

/**
 * Custom hook to manage test cases state with useReducer
 * Provides better performance and cleaner state management for complex state
 */
export function useTestCasesReducer(initialTestCases: TestCase[]) {
  const [state, dispatch] = useReducer(testCasesReducer, {
    testCases: initialTestCases,
    editingIndex: null,
    deleteIndex: null,
    isGenerating: false,
    isDeleting: false,
  });

  const setTestCases = useCallback((testCases: TestCase[]) => {
    dispatch({ type: 'SET_TEST_CASES', payload: testCases });
  }, []);

  const addTestCase = useCallback((testCase: TestCase) => {
    dispatch({ type: 'ADD_TEST_CASE', payload: testCase });
  }, []);

  const addMultipleTestCases = useCallback((testCases: TestCase[]) => {
    dispatch({ type: 'ADD_MULTIPLE_TEST_CASES', payload: testCases });
  }, []);

  const updateTestCase = useCallback((index: number, testCase: TestCase) => {
    dispatch({ type: 'UPDATE_TEST_CASE', index, payload: testCase });
  }, []);

  const deleteTestCase = useCallback((index: number) => {
    dispatch({ type: 'DELETE_TEST_CASE', index });
  }, []);

  const duplicateTestCase = useCallback((index: number) => {
    dispatch({ type: 'DUPLICATE_TEST_CASE', index });
  }, []);

  const setEditingIndex = useCallback((index: number | null) => {
    dispatch({ type: 'SET_EDITING_INDEX', index });
  }, []);

  const setDeleteIndex = useCallback((index: number | null) => {
    dispatch({ type: 'SET_DELETE_INDEX', index });
  }, []);

  const setGenerating = useCallback((isGenerating: boolean) => {
    dispatch({ type: 'SET_GENERATING', isGenerating });
  }, []);

  const setDeleting = useCallback((isDeleting: boolean) => {
    dispatch({ type: 'SET_DELETING', isDeleting });
  }, []);

  return {
    state,
    actions: {
      setTestCases,
      addTestCase,
      addMultipleTestCases,
      updateTestCase,
      deleteTestCase,
      duplicateTestCase,
      setEditingIndex,
      setDeleteIndex,
      setGenerating,
      setDeleting,
    },
  };
}
