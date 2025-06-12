import { safeJsonStringify, summarizeEvaluateResultForLogging } from './json';

describe('JSON utilities for large data handling', () => {
  // Create a massive string that would cause RangeError in JSON.stringify
  const createHugeString = (sizeMB: number) => 'A'.repeat(sizeMB * 1024 * 1024);

  // Create a mock EvaluateResult with massive data
  const createLargeEvaluateResult = () => {
    const hugeString = createHugeString(50); // 50MB string - this will definitely cause RangeError
    
    return {
      id: 'test-eval-result',
      testIdx: 0,
      promptIdx: 0,
      success: false,
      score: 0.5,
      error: 'Test error',
      failureReason: 'ERROR',
      provider: {
        id: 'test-provider',
        label: 'Test Provider'
      },
      response: {
        output: hugeString, // This massive output would cause the RangeError
        raw: {
          data: hugeString,
          metadata: {
            tokens: hugeString,
            debug: hugeString
          }
        },
        error: null,
        cached: false,
        cost: 0.01,
        tokenUsage: {
          total: 1000,
          prompt: 500,
          completion: 500
        },
        metadata: {
          largeField: hugeString,
          anotherLargeField: hugeString,
          model: 'gpt-4',
          timestamp: '2024-01-01T00:00:00Z'
        }
      },
      testCase: {
        description: 'Test case with large data',
        vars: {
          input: hugeString,
          context: hugeString,
          examples: [hugeString, hugeString, hugeString]
        }
      },
      prompt: {
        raw: hugeString,
        display: hugeString
      },
      vars: {
        userInput: hugeString,
        systemPrompt: hugeString
      }
    };
  };

  describe('safeJsonStringify', () => {
    it('should handle extremely large objects without throwing RangeError', () => {
      const largeResult = createLargeEvaluateResult();
      
      // This should NOT throw a RangeError
      expect(() => {
        const result = safeJsonStringify(largeResult);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });

    it('should return truncated version for objects that would cause RangeError', () => {
      const largeResult = createLargeEvaluateResult();
      const result = safeJsonStringify(largeResult);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      
      // The result should be much smaller than the original massive data
      // Original would be 200MB+, truncated should be much smaller
      expect(result!.length).toBeLessThan(100000); // Less than 100KB
      
      // Should contain truncation indicators
      expect(result).toContain('...[truncated]');
    });

    it('should handle normal objects without truncation', () => {
      const normalObject = { id: 1, name: 'test', data: 'small data' };
      const result = safeJsonStringify(normalObject);
      
      expect(result).toBe(JSON.stringify(normalObject));
      expect(result).not.toContain('...[truncated]');
    });
  });

  describe('summarizeEvaluateResultForLogging', () => {
    it('should create a safe summary of large evaluation results', () => {
      const largeResult = createLargeEvaluateResult();
      const summary = summarizeEvaluateResultForLogging(largeResult);
      
      // Should preserve essential fields
      expect(summary.id).toBe('test-eval-result');
      expect(summary.testIdx).toBe(0);
      expect(summary.promptIdx).toBe(0);
      expect(summary.success).toBe(false);
      expect(summary.score).toBe(0.5);
      expect(summary.error).toBe('Test error');
      expect(summary.failureReason).toBe('ERROR');
      
      // Should preserve provider info
      expect(summary.provider.id).toBe('test-provider');
      expect(summary.provider.label).toBe('Test Provider');
      
      // Should truncate large response output
      expect(summary.response.output).toBeDefined();
      expect(summary.response.output.length).toBeLessThanOrEqual(515); // 500 + '...[truncated]'
      expect(summary.response.output).toContain('...[truncated]');
      
      // Should preserve other response fields without large data
      expect(summary.response.cached).toBe(false);
      expect(summary.response.cost).toBe(0.01);
      expect(summary.response.tokenUsage).toEqual({
        total: 1000,
        prompt: 500,
        completion: 500
      });
      
      // Should include metadata keys but not values
      expect(summary.response.metadata.keys).toContain('largeField');
      expect(summary.response.metadata.keys).toContain('anotherLargeField');
      expect(summary.response.metadata.keys).toContain('model');
      expect(summary.response.metadata.keys).toContain('timestamp');
      expect(summary.response.metadata.keyCount).toBe(4);
      
      // Should include test case info without large data
      expect(summary.testCase.description).toBe('Test case with large data');
      expect(summary.testCase.vars).toEqual(['input', 'context', 'examples']);
    });

    it('should be safely stringifiable even for massive input', () => {
      const largeResult = createLargeEvaluateResult();
      const summary = summarizeEvaluateResultForLogging(largeResult);
      
      // This should definitely not throw
      expect(() => {
        const result = safeJsonStringify(summary);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
        expect(result!.length).toBeLessThan(10000); // Should be quite small
      }).not.toThrow();
    });
  });

  describe('Integration test - simulating evaluator error logging', () => {
    it('should handle the exact scenario that causes RangeError in evaluator.ts:775', () => {
      // Simulate the exact scenario from evaluator.ts line 775
      const largeEvalResult = createLargeEvaluateResult();
      
      // This simulates the original problematic code:
      // logger.error(`Error saving result: ${error} ${safeJsonStringify(row)}`);
      const mockError = new Error('Database connection failed');
      
      expect(() => {
        // This should work without throwing RangeError
        const resultSummary = summarizeEvaluateResultForLogging(largeEvalResult);
        const logMessage = `Error saving result: ${mockError} ${safeJsonStringify(resultSummary)}`;
        
        expect(logMessage).toBeDefined();
        expect(logMessage).toContain('Error saving result: Error: Database connection failed');
        expect(logMessage).toContain('"id":"test-eval-result"');
        expect(logMessage).toContain('"success":false');
        
        // Should be reasonably sized for logging
        expect(logMessage.length).toBeLessThan(5000);
      }).not.toThrow();
    });
  });
});