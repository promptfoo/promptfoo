import dedent from 'dedent';
import { z } from 'zod';
import { runAssertions } from '../../../assertions/index';
import logger from '../../../logger';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Assertion, AtomicTestCase } from '../../../types/index';

function getScoreDescription(score: number): string {
  if (score === 1) {
    return 'Perfect';
  }
  if (score >= 0.8) {
    return 'Good';
  }
  if (score >= 0.5) {
    return 'Moderate';
  }
  return 'Poor';
}

function truncateString(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return value;
  }
  return value.slice(0, maxLength) + (value.length > maxLength ? '...' : '');
}

function buildAssertionData(
  result: any,
  assertion: any,
  output: string,
  prompt: string | undefined,
  vars: Record<string, any>,
  latencyMs: number | undefined,
): object {
  return {
    assertion: {
      type: assertion.type,
      value: assertion.value,
      threshold: assertion.threshold,
      weight: assertion.weight || 1,
      metric: assertion.metric,
    },
    result: {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      namedScores: result.namedScores || {},
      tokensUsed: result.tokensUsed || null,
      componentResults: result.componentResults || [],
    },
    input: {
      output: truncateString(output, 200),
      prompt: truncateString(prompt, 100),
      vars: Object.keys(vars).length > 0 ? vars : null,
      latencyMs,
    },
    evaluation: {
      passed: result.pass,
      scoreDescription: getScoreDescription(result.score),
      hasNamedMetrics: Object.keys(result.namedScores || {}).length > 0,
      usedTokens: result.tokensUsed ? result.tokensUsed.total || 0 : 0,
    },
  };
}

function buildErrorData(args: any, errorMessage: string): object {
  return {
    assertion: {
      type: args.assertion?.type || 'unknown',
      value: args.assertion?.value,
    },
    error: errorMessage,
    input: {
      output: truncateString(args.output, 100),
      prompt: truncateString(args.prompt, 100),
    },
    troubleshooting: {
      commonIssues: [
        'Invalid assertion type - check spelling and supported types',
        'Missing required assertion value or configuration',
        'Provider required for model-graded assertions (llm-rubric, factuality, etc.)',
        'Transform script errors - check syntax and file paths',
      ],
      supportedTypes: [
        'contains',
        'equals',
        'regex',
        'starts-with',
        'llm-rubric',
        'factuality',
        'answer-relevance',
        'is-json',
        'is-xml',
        'is-sql',
        'similar',
        'javascript',
        'python',
        'webhook',
      ],
    },
  };
}

/**
 * Run an assertion against an LLM output to test grading logic
 *
 * Use this tool to:
 * - Test assertion configurations before using them in evaluations
 * - Debug why specific outputs are passing or failing assertions
 * - Validate grading logic for custom assertions
 * - Experiment with different assertion parameters
 *
 * Supports all promptfoo assertion types including:
 * - Content checks: contains, equals, regex, starts-with
 * - LLM-graded: llm-rubric, factuality, answer-relevance
 * - Format validation: is-json, is-xml, is-sql
 * - Quality metrics: similarity, perplexity, cost, latency
 * - Custom: javascript, python, webhook assertions
 */
export function registerRunAssertionTool(server: McpServer) {
  server.tool(
    'run_assertion',
    {
      output: z.string().describe(
        dedent`
            The LLM output to test the assertion against.
            Example: "Paris is the capital of France"
          `,
      ),
      assertion: z
        .object({
          type: z.string().describe('Assertion type (e.g., "contains", "llm-rubric", "equals")'),
          value: z.any().optional().describe('Expected value or criteria for the assertion'),
          threshold: z.number().optional().describe('Score threshold for pass/fail (0-1)'),
          weight: z.number().optional().describe('Weight of this assertion (default: 1)'),
          metric: z.string().optional().describe('Name this assertion as a metric'),
          provider: z.any().optional().describe('LLM provider config for model-graded assertions'),
          transform: z.string().optional().describe('Transform the output before assertion'),
          config: z
            .record(z.string(), z.any())
            .optional()
            .describe('Additional assertion configuration'),
        })
        .describe(
          dedent`
            The assertion configuration to run.
            Example: {"type": "contains", "value": "Paris"}
          `,
        ),
      prompt: z
        .string()
        .optional()
        .describe(
          dedent`
            The original prompt used to generate the output.
            Optional but helpful for context-aware assertions.
          `,
        ),
      vars: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          dedent`
            Variables used in the prompt.
            Example: {"city": "Paris", "country": "France"}
          `,
        ),
      latencyMs: z
        .number()
        .optional()
        .describe('Response latency in milliseconds for latency assertions'),
    },
    async (args) => {
      try {
        const { output, assertion, prompt, vars = {}, latencyMs } = args;

        const testCase: AtomicTestCase = {
          vars,
          assert: [assertion as Assertion],
        };

        const providerResponse = {
          output,
          tokenUsage: {},
          cost: 0,
          cached: false,
        };

        logger.debug(`Running assertion ${assertion.type} on output: ${output.slice(0, 100)}...`);

        const result = await runAssertions({
          prompt,
          provider: undefined,
          providerResponse,
          test: testCase,
          latencyMs,
        });

        const assertionData = buildAssertionData(
          result,
          assertion,
          output,
          prompt,
          vars,
          latencyMs,
        );
        return createToolResponse('run_assertion', true, assertionData);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error(`Assertion execution failed: ${errorMessage}`);
        return createToolResponse('run_assertion', false, buildErrorData(args, errorMessage));
      }
    },
  );
}
