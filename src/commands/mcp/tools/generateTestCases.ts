import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { synthesizeFromTestSuite } from '../../../testCase/synthesis';
import type { TestSuite } from '../../../types';
import { AbstractTool } from '../lib/baseTool';
import type { ToolResult } from '../lib/types';

/**
 * Generate test cases with assertions for existing prompts
 *
 * Use this tool to:
 * - Automatically create test cases with appropriate assertions
 * - Generate edge cases and expected outputs
 * - Build comprehensive test suites for prompts
 * - Save time on manual assertion writing
 * - Ensure consistent test coverage
 * 
 * @example
 * // Generate test cases for a simple prompt
 * await generateTestCases({
 *   prompt: "Translate the following text to French: {{text}}",
 *   numTestCases: 5
 * })
 * 
 * @example
 * // Generate with specific assertion types
 * await generateTestCases({
 *   prompt: "Classify sentiment: {{review}}",
 *   numTestCases: 10,
 *   instructions: "Include positive, negative, and neutral examples",
 *   assertionTypes: ["equals", "contains", "javascript"]
 * })
 */
export class GenerateTestCasesTool extends AbstractTool {
  readonly name = 'generate_test_cases';
  readonly description = 'Generate test cases with assertions for existing prompts';
  
  protected readonly schema = z.object({
    prompt: z
      .string()
      .min(1, 'Prompt cannot be empty')
      .describe('The prompt template to generate test cases for. Use {{variable}} syntax for variables.'),
    
    instructions: z
      .string()
      .optional()
      .describe(
        dedent`
          Additional instructions for test case generation.
          Examples: "Focus on edge cases", "Include multilingual examples",
          "Test error handling scenarios"
        `
      ),
    
    numTestCases: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(5)
      .describe('Number of test cases to generate (1-50)'),
    
    assertionTypes: z
      .array(z.enum(['equals', 'contains', 'icontains', 'regex', 'javascript', 'llm-rubric']))
      .optional()
      .describe(
        dedent`
          Types of assertions to generate.
          Defaults to appropriate types based on the prompt.
        `
      ),
      
    provider: z
      .string()
      .optional()
      .describe(
        dedent`
          AI provider to use for generation.
          Examples: "openai:gpt-4o", "anthropic:claude-3-sonnet"
          Defaults to configured default provider.
        `
      ),
      
    outputPath: z
      .string()
      .optional()
      .describe('Path to save the generated test cases (e.g., "tests/generated-cases.yaml")'),
  });

  protected async execute(args: unknown): Promise<ToolResult> {
    const { prompt, instructions, numTestCases, assertionTypes, provider, outputPath } = this.schema.parse(args);
    
    try {
      // Extract variables from the prompt
      const variableMatches = prompt.match(/\{\{(\w+)\}\}/g);
      const variables = variableMatches 
        ? [...new Set(variableMatches.map(v => v.slice(2, -2)))]
        : [];
      
      if (variables.length === 0) {
        return this.error(
          'No variables found in prompt. Use {{variable}} syntax to define variables.',
          { prompt, example: 'Translate to French: {{text}}' }
        );
      }
      
      // Create a test suite for generation
      const testSuite: TestSuite = {
        prompts: [{ label: 'test-case-generation', raw: prompt }],
        providers: [],
        tests: [], // Will be generated
      };
      
      // Generate test cases with variables
      const results = await synthesizeFromTestSuite(testSuite, {
        instructions,
        numPersonas: 1,
        numTestCasesPerPersona: numTestCases,
        provider,
      });
      
      if (!results || results.length === 0) {
        return this.error('Failed to generate test cases. No data returned.');
      }
      
      // Format results as test cases with basic assertions
      const tests = results.map((vars: any) => {
        const testCase: any = { vars };
        
        // Add basic assertions based on the prompt type
        if (assertionTypes && assertionTypes.length > 0) {
          testCase.assert = assertionTypes.map(type => ({ type }));
        } else {
          // Default assertions
          testCase.assert = [
            { type: 'is-json' },
            { type: 'not-empty' },
          ];
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
      const analysis = this.analyzeTestCases(tests, variables);
      
      return this.success({
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
        return this.error(
          'Failed to load AI provider for test case generation',
          { 
            originalError: errorMessage,
            suggestion: 'Check that the provider is properly configured with valid credentials'
          }
        );
      }
      
      if (errorMessage.includes('rate limit')) {
        return this.error(
          'Rate limit exceeded while generating test cases',
          { 
            originalError: errorMessage,
            suggestion: 'Try reducing numTestCases or wait before retrying'
          }
        );
      }
      
      return this.error(`Failed to generate test cases: ${errorMessage}`);
    }
  }
  
  private analyzeTestCases(testCases: any[], variables: string[]): any {
    const analysis = {
      totalCases: testCases.length,
      casesWithAssertions: 0,
      assertionTypes: {} as Record<string, number>,
      variableCoverage: {} as Record<string, number>,
      insights: [] as string[],
    };
    
    // Analyze each test case
    testCases.forEach(testCase => {
      // Count assertions
      if (testCase.assert && testCase.assert.length > 0) {
        analysis.casesWithAssertions++;
        
        // Count assertion types
        testCase.assert.forEach((assertion: any) => {
          const type = assertion.type || 'unknown';
          analysis.assertionTypes[type] = (analysis.assertionTypes[type] || 0) + 1;
        });
      }
      
      // Check variable coverage
      if (testCase.vars) {
        Object.keys(testCase.vars).forEach(varName => {
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
        `${analysis.totalCases - analysis.casesWithAssertions} test cases missing assertions`
      );
    }
    
    // Check variable coverage
    const uncoveredVars = variables.filter(v => !analysis.variableCoverage[v]);
    if (uncoveredVars.length > 0) {
      analysis.insights.push(`Variables not covered: ${uncoveredVars.join(', ')}`);
    } else {
      analysis.insights.push('All variables have test coverage ✓');
    }
    
    // Most common assertion type
    const assertionEntries = Object.entries(analysis.assertionTypes);
    if (assertionEntries.length > 0) {
      const mostCommon = assertionEntries.reduce((a, b) => a[1] > b[1] ? a : b);
      analysis.insights.push(`Most common assertion type: ${mostCommon[0]} (${mostCommon[1]} uses)`);
    }
    
    return analysis;
  }
}

/**
 * Register the generate test cases tool with the MCP server
 */
export function registerGenerateTestCasesTool(server: McpServer) {
  const tool = new GenerateTestCasesTool();
  tool.register(server);
} 