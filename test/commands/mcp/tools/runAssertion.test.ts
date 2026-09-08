import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerRunAssertionTool } from '../../../../src/commands/mcp/tools/runAssertion';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ApiProvider } from '../../../../src/types/index';

describe('run_assertion rubric components', () => {
  it('preserves the opt-in through the registered tool schema and grades once', async () => {
    const tool = vi.fn();
    registerRunAssertionTool({ tool } as unknown as McpServer);
    const [name, shape, handler] = tool.mock.calls[0];
    expect(name).toBe('run_assertion');

    const callApi = vi.fn(async () => ({
      output: JSON.stringify({
        components: [
          { metric: 'accuracy', pass: true, score: 1, reason: 'Correct' },
          { metric: 'clarity', pass: false, score: 0, reason: 'Unclear' },
        ],
      }),
      tokenUsage: { prompt: 10, completion: 5, numRequests: 1 },
    }));
    const provider: ApiProvider = { id: () => 'offline-mcp-rubric-grader', callApi };
    // Parse the actual registered schema before dispatch, as the MCP SDK does.
    // Calling the handler directly with unparsed arguments would miss dropped flags.
    const args = z.object(shape).parse({
      output: 'Candidate',
      assertion: {
        type: 'llm-rubric',
        rubricComponents: true,
        threshold: 0.5,
        provider,
        value: {
          components: [
            { metric: 'accuracy', value: 'Answers correctly' },
            { metric: 'clarity', value: 'Uses clear language' },
          ],
        },
      },
    });
    expect(args).toMatchObject({ assertion: { rubricComponents: true } });

    const response = await handler(args);
    expect(response.isError).toBe(false);
    const payload = JSON.parse(response.content[0].text);
    expect(payload.data.assertion.rubricComponents).toBe(true);
    expect(payload.data.result).toMatchObject({
      pass: true,
      score: 0.5,
      namedScores: { accuracy: 1, clarity: 0 },
      tokensUsed: { numRequests: 1 },
    });
    expect(payload.data.result.componentResults).toHaveLength(3);
    expect(payload.data.result.componentResults[0]).toMatchObject({
      metadata: { renderedGradingPrompt: expect.any(String) },
      componentResults: [{ score: 1 }, { score: 0 }],
    });
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, false])(
    'keeps a legacy components-shaped object scalar when opt-in is %s',
    async (rubricComponents) => {
      const tool = vi.fn();
      registerRunAssertionTool({ tool } as unknown as McpServer);
      const [, shape, handler] = tool.mock.calls[0];
      const callApi = vi.fn(async () => ({
        output: JSON.stringify({ pass: true, score: 0.8, reason: 'Legacy scalar grading' }),
      }));
      const args = z.object(shape).parse({
        output: 'Candidate',
        assertion: {
          type: 'llm-rubric',
          ...(rubricComponents !== undefined && { rubricComponents }),
          provider: { id: () => 'offline-legacy-mcp-grader', callApi },
          value: { components: [{ metric: 'accuracy', value: 'Answers correctly' }] },
        },
      });
      const response = await handler(args);
      expect(response.isError).toBe(false);
      const payload = JSON.parse(response.content[0].text);
      expect(payload.data.result).toMatchObject({
        pass: true,
        score: 0.8,
        reason: 'All assertions passed',
      });
      expect(payload.data.result.componentResults).toHaveLength(1);
      expect(payload.data.result.componentResults[0].reason).toBe('Legacy scalar grading');
      expect(payload.data.result.componentResults[0].componentResults).toBeUndefined();
      expect(callApi).toHaveBeenCalledTimes(1);
    },
  );
});
