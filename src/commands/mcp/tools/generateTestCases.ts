import dedent from 'dedent';
import { z } from 'zod';
import { synthesizeFromTestSuite } from '../../../testCase/synthesis';
import { createToolResponse, DEFAULT_TOOL_TIMEOUT_MS, withTimeout } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TestSuite, VarMapping } from '../../../types/index';

/**
 * A generated test case with variables and assertions
 */
interface GeneratedTestCase {
  vars: VarMapping;
  assert: Array<{ type: string }>;
}

/**
 * Analysis results for generated test cases
 */
interface TestCaseAnalysis {
  totalCases: number;
  casesWithAssertions: number;
  assertionTypes: Record<string, number>;
  variableCoverage: Record<string, number>;
  insights: string[];
}

/**
 * Tool to generate test cases with assertions for existing prompts
 */
export function registerGenerateTestCasesTool(server: McpServer) {
  server.tool(
    'generate_test_cases',
    {
      prompt: z
        .string()
        .min(1, 'Prompt cannot be empty')
        .describe(
          'The prompt template to generate test cases for. Use {{variable}} syntax for variables.',
        ),

      instructions: z
        .string()
        .optional()
        .describe(
          dedent`
            Additional instructions for test case generation.
            Examples: "Focus on edge cases", "Include multilingual examples",
            "Test error handling scenarios"
          `,
        ),

      numTestCases: z
        .int()
        .min(1)
        .max(50)
        .prefault(5)
        .describe('Number of test cases to generate (1-50)'),

      assertionTypes: z
        .array(z.enum(['equals', 'contains', 'icontains', 'regex', 'javascript', 'llm-rubric']))
        .optional()
        .describe(
          dedent`
            Types of assertions to generate.
            Defaults to appropriate types based on the prompt.
          `,
        ),

      provider: z
        .string()
        .optional()
        .describe(
          dedent`
            AI provider to use for generation.
            Examples: "openai:gpt-4o", "anthropic:claude-3-sonnet"
            Defaults to configured default provider.
          `,
        ),

      outputPath: z
        .string()
        .optional()
        .describe('Path to save the generated test cases (e.g., "tests/generated-cases.yaml")'),
    },
    async (args) => {
      const { prompt, instructions, numTestCases = 5, assertionTypes, provider, outputPath } = args;

      try {
        // Extract variables from the prompt
        const variableMatches = prompt.match(/\{\{(\w+)\}\}/g);
        const variables = variableMatches
          ? [...new Set(variableMatches.map((v) => v.slice(2, -2)))]
          : [];

        if (variables.length === 0) {
          return createToolResponse(
            'generate_test_cases',
            false,
            { prompt, example: 'Translate to French: {{text}}' },
            'No variables found in prompt. Use {{variable}} syntax to define variables.',
          );
        }

        // Create a test suite for generation
        const testSuite: TestSuite = {
          prompts: [{ label: 'test-case-generation', raw: prompt }],
          providers: [],
          tests: [], // Will be generated
        };

        // Generate test cases with variables (with timeout protection)
        const results = await withTimeout(
          synthesizeFromTestSuite(testSuite, {
            instructions,
            numPersonas: 1,
            numTestCasesPerPersona: numTestCases,
            provider,
          }),
          DEFAULT_TOOL_TIMEOUT_MS,
          'Test case generation timed out. This may indicate provider connectivity issues or missing API credentials.',
        );

        if (!results || results.length === 0) {
          return createToolResponse(
            'generate_test_cases',
            false,
            undefined,
            'Failed to generate test cases. No data returned.',
          );
        }

        // Format results as test cases with basic assertions
        const tests: GeneratedTestCase[] = results.map((vars) => {
          const testCase: GeneratedTestCase = { vars, assert: [] };

          // Add basic assertions based on the prompt type
          if (assertionTypes && assertionTypes.length > 0) {
            testCase.assert = assertionTypes.map((type) => ({ type }));
          } else {
            // Default assertions
            testCase.assert = [{ type: 'is-json' }, { type: 'not-empty' }];
          }

          return testCase;
        });

        // Save to file if outputPath is provided
        if (outputPath) {
          const fs = await import('fs');
          const yaml = await import('js-yaml');
          const yamlContent = yaml.dump({ tests });
          fs.writeFileSync(outputPath, yamlContent);
        }

        // Analyze the generated test cases
        const analysis = analyzeTestCases(tests, variables);

        return createToolResponse('generate_test_cases', true, {
          testCases: tests,
          analysis,
          summary: {
            totalGenerated: tests.length,
            prompt,
            variables,
            outputPath: outputPath || 'Not saved to file',
            provider: provider || 'default',
          },
          message: `Successfully generated ${tests.length} test cases with assertions`,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        // Provide specific error guidance
        if (errorMessage.includes('provider')) {
          return createToolResponse(
            'generate_test_cases',
            false,
            {
              originalError: errorMessage,
              suggestion: 'Check that the provider is properly configured with valid credentials',
            },
            'Failed to load AI provider for test case generation',
          );
        }

        if (errorMessage.includes('rate limit')) {
          return createToolResponse(
            'generate_test_cases',
            false,
            {
              originalError: errorMessage,
              suggestion: 'Try reducing numTestCases or wait before retrying',
            },
            'Rate limit exceeded while generating test cases',
          );
        }

        if (errorMessage.includes('timed out')) {
          return createToolResponse(
            'generate_test_cases',
            false,
            {
              originalError: errorMessage,
              suggestion:
                'Ensure your provider API keys are correctly configured and the provider is reachable',
            },
            'Test case generation timed out',
          );
        }

        return createToolResponse(
          'generate_test_cases',
          false,
          undefined,
          `Failed to generate test cases: ${errorMessage}`,
        );
      }
    },
  );
}

function analyzeTestCases(testCases: GeneratedTestCase[], variables: string[]): TestCaseAnalysis {
  const analysis: TestCaseAnalysis = {
    totalCases: testCases.length,
    casesWithAssertions: 0,
    assertionTypes: {},
    variableCoverage: {},
    insights: [],
  };

  // Analyze each test case
  testCases.forEach((testCase) => {
    // Count assertions
    if (testCase.assert && testCase.assert.length > 0) {
      analysis.casesWithAssertions++;

      // Count assertion types
      testCase.assert.forEach((assertion) => {
        const type = assertion.type || 'unknown';
        analysis.assertionTypes[type] = (analysis.assertionTypes[type] || 0) + 1;
      });
    }

    // Check variable coverage
    if (testCase.vars) {
      Object.keys(testCase.vars).forEach((varName) => {
        if (variables.includes(varName)) {
          analysis.variableCoverage[varName] = (analysis.variableCoverage[varName] || 0) + 1;
        }
      });
    }
  });

  // Generate insights
  if (analysis.casesWithAssertions === analysis.totalCases) {
    analysis.insights.push('All test cases have assertions ✓');
  } else {
    analysis.insights.push(
      `${analysis.totalCases - analysis.casesWithAssertions} test cases missing assertions`,
    );
  }

  // Check variable coverage
  const uncoveredVars = variables.filter((v) => !analysis.variableCoverage[v]);
  if (uncoveredVars.length > 0) {
    analysis.insights.push(`Variables not covered: ${uncoveredVars.join(', ')}`);
  } else {
    analysis.insights.push('All variables have test coverage ✓');
  }

  // Most common assertion type
  const assertionEntries = Object.entries(analysis.assertionTypes);
  if (assertionEntries.length > 0) {
    const mostCommon = assertionEntries.reduce((a, b) => (a[1] > b[1] ? a : b));
    analysis.insights.push(`Most common assertion type: ${mostCommon[0]} (${mostCommon[1]} uses)`);
  }

  return analysis;
}
