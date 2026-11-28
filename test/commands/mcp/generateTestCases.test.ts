import { describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions';
import { registerGenerateTestCasesTool } from '../../../src/commands/mcp/tools/generateTestCases';
import { synthesizeFromTestSuite } from '../../../src/testCase/synthesis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../../../src/testCase/synthesis');

describe('generate_test_cases', () => {
  it('emits assertions that grade structured JSON in safe mode', async () => {
    vi.stubEnv('PROMPTFOO_SAFE_MODE', 'true');
    try {
      vi.mocked(synthesizeFromTestSuite).mockResolvedValue([{ item: 'fixture' }]);
      const tool = vi.fn();
      registerGenerateTestCasesTool({ tool } as unknown as McpServer);

      const run = tool.mock.calls[0][2];
      const response = await run({ prompt: '{{item}}', numTestCases: 1 });
      expect(response.isError).toBe(false);

      const { data } = JSON.parse(response.content[0].text);
      const [testCase] = data.testCases;
      expect(testCase.assert).toEqual([{ type: 'is-json' }]);

      const assertion = testCase.assert[0];
      const evaluate = (output: unknown) =>
        runAssertion({
          assertion,
          prompt: 'Return JSON for fixture',
          test: testCase,
          providerResponse: { output },
        });

      await expect(evaluate({ item: 'fixture' })).resolves.toMatchObject({
        pass: true,
        score: 1,
      });
      await expect(evaluate('   ')).resolves.toMatchObject({ pass: false, score: 0 });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
