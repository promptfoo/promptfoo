import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerRunAssertionTool } from '../../../../src/commands/mcp/tools/runAssertion';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('run_assertion metric-only input', () => {
  it.each([undefined, false, true])(
    'preserves metricOnly=%s through the registered input',
    async (metricOnly) => {
      const tool = vi.fn();
      registerRunAssertionTool({ tool } as unknown as McpServer);
      const [, schema, handler] = tool.mock.calls[0];
      const args = z.object(schema).parse({
        output: 'Paris',
        assertion: { type: 'contains', value: 'Berlin', metric: 'missing_city', metricOnly },
      });
      const response = await handler(args);
      expect(response.isError).toBe(false);
      const data = JSON.parse(response.content[0].text).data;
      expect(data.assertion.metricOnly).toBe(metricOnly);
      expect(data.result.pass).toBe(metricOnly === true);
      expect(data.result.score).toBe(0);
      expect(data.result.namedScores).toEqual({ missing_city: 0 });
      expect(data.result.componentResults[0]).toMatchObject({ pass: false, score: 0 });
      if (metricOnly) {
        expect(data.result.componentResults[0].assertion.metricOnly).toBe(true);
      }
    },
  );

  it('rejects a non-boolean metric-only flag at the MCP boundary', () => {
    const tool = vi.fn();
    registerRunAssertionTool({ tool } as unknown as McpServer);
    const [, schema] = tool.mock.calls[0];
    expect(() =>
      z.object(schema).parse({
        output: 'Paris',
        assertion: { type: 'contains', value: 'Berlin', metricOnly: 'true' },
      }),
    ).toThrow();
  });

  it.each(['select-best', 'max-score', 'assert-set'])(
    'rejects unsupported metric-only assertions: %s',
    async (type) => {
      const tool = vi.fn();
      registerRunAssertionTool({ tool } as unknown as McpServer);
      const [, schema, handler] = tool.mock.calls[0];
      const args = z.object(schema).parse({
        output: 'Paris',
        assertion: { type, value: 'Prefer the correct answer', metricOnly: true },
      });
      const response = await handler(args);
      expect(response.isError).toBe(true);
      expect(JSON.parse(response.content[0].text).error).toContain(
        `'metricOnly' is not supported on ${type}`,
      );
    },
  );
});
