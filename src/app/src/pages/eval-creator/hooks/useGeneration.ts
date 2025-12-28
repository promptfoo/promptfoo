import { useState, useCallback } from 'react';
import { callApi } from '@app/utils/api';
import type { Assertion, TestCase } from '@promptfoo/types';

interface GenerateAssertionsRequest {
  prompts: string[];
  instructions?: string;
  numAssertions?: number;
  existingTests?: TestCase[];
  type?: 'pi' | 'g-eval' | 'llm-rubric';
}

interface GenerateAssertionsResponse {
  success: boolean;
  data?: {
    assertions: Assertion[];
    metadata: {
      generatedCount: number;
      requestedCount: number;
      type: string;
      durationMs: number;
    };
  };
  error?: string;
  message?: string;
}

interface GenerateTestCasesRequest {
  prompts: string[];
  instructions?: string;
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  existingTests?: TestCase[];
}

interface GenerateTestCasesResponse {
  success: boolean;
  data?: {
    testCases: TestCase[];
    metadata: {
      generatedCount: number;
      requestedCount: number;
      numPersonas: number;
      numTestCasesPerPersona: number;
      durationMs: number;
    };
  };
  error?: string;
  message?: string;
}

interface UseGenerationReturn {
  // Assertions
  generateAssertions: (request: GenerateAssertionsRequest) => Promise<Assertion[]>;
  isGeneratingAssertions: boolean;
  assertionsError: string | null;

  // Test cases
  generateTestCases: (request: GenerateTestCasesRequest) => Promise<TestCase[]>;
  isGeneratingTestCases: boolean;
  testCasesError: string | null;
}

export function useGeneration(): UseGenerationReturn {
  const [isGeneratingAssertions, setIsGeneratingAssertions] = useState(false);
  const [assertionsError, setAssertionsError] = useState<string | null>(null);
  const [isGeneratingTestCases, setIsGeneratingTestCases] = useState(false);
  const [testCasesError, setTestCasesError] = useState<string | null>(null);

  const generateAssertions = useCallback(
    async (request: GenerateAssertionsRequest): Promise<Assertion[]> => {
      setIsGeneratingAssertions(true);
      setAssertionsError(null);

      try {
        const response = await callApi('/generate/assertions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompts: request.prompts,
            instructions: request.instructions,
            numAssertions: request.numAssertions || 5,
            existingTests: request.existingTests || [],
            type: request.type || 'llm-rubric',
          }),
        });

        const data: GenerateAssertionsResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || data.error || 'Failed to generate assertions');
        }

        return data.data?.assertions || [];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate assertions';
        setAssertionsError(message);
        throw error;
      } finally {
        setIsGeneratingAssertions(false);
      }
    },
    [],
  );

  const generateTestCases = useCallback(
    async (request: GenerateTestCasesRequest): Promise<TestCase[]> => {
      setIsGeneratingTestCases(true);
      setTestCasesError(null);

      try {
        const response = await callApi('/generate/testcases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompts: request.prompts,
            instructions: request.instructions,
            numPersonas: request.numPersonas || 5,
            numTestCasesPerPersona: request.numTestCasesPerPersona || 3,
            existingTests: request.existingTests || [],
          }),
        });

        const data: GenerateTestCasesResponse = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || data.error || 'Failed to generate test cases');
        }

        return data.data?.testCases || [];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate test cases';
        setTestCasesError(message);
        throw error;
      } finally {
        setIsGeneratingTestCases(false);
      }
    },
    [],
  );

  return {
    generateAssertions,
    isGeneratingAssertions,
    assertionsError,
    generateTestCases,
    isGeneratingTestCases,
    testCasesError,
  };
}

export default useGeneration;
