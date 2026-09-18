import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerRunAssertionTool } from '../../../../src/commands/mcp/tools/runAssertion';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('run_assertion tool', () => {
  it('should preserve script in the assertion input schema', () => {
    const tool = vi.fn();
    registerRunAssertionTool({ tool } as unknown as McpServer);

    const inputShape = tool.mock.calls[0][1] as Parameters<typeof z.object>[0];
    const input = z.object(inputShape).parse({
      output: 'Expected output',
      assertion: {
        type: 'javascript',
        script: 'file://checks/assert.js',
        value: 'Expected value',
      },
    });

    expect(input.assertion).toMatchObject({
      type: 'javascript',
      script: 'file://checks/assert.js',
      value: 'Expected value',
    });
  });
});
