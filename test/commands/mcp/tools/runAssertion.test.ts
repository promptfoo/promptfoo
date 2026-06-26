import { describe, expect, it, vi } from 'vitest';
import { registerRunAssertionTool } from '../../../../src/commands/mcp/tools/runAssertion';

describe('run_assertion MCP tool', () => {
  it.each([
    ['is-valid-openai-tools-call', 'MCP Tool Result (search): ok', true, 1],
    ['not-is-valid-openai-tools-call', 'MCP Tool Error (search): failed', true, 1],
  ] as const)('preserves manual rendered MCP input for %s', async (type, output, pass, score) => {
    let handler: ((args: any) => Promise<any>) | undefined;
    const server = {
      tool: vi.fn((_name: string, _schema: unknown, registered: typeof handler) => {
        handler = registered;
      }),
    };
    registerRunAssertionTool(server as never);

    const response = await handler!({ output, assertion: { type } });
    const payload = JSON.parse(response.content[0].text);

    expect(payload.data.result).toMatchObject({ pass, score });
  });
});
