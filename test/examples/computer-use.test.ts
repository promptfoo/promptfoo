import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions';

import type { Assertion } from '../../src/types';

const configPath = path.join(
  __dirname,
  '../../examples/openai-codex-app-server/computer-use/promptfooconfig.yaml',
);
const config = yaml.load(fs.readFileSync(configPath, 'utf8')) as {
  providers: Array<{
    config: { server_request_policy: { mcp_elicitation: unknown } };
  }>;
  defaultTest: { assert: Assertion[] };
};
const trajectoryAssertion = config.defaultTest.assert.find(
  (assertion) =>
    assertion.type === 'javascript' && String(assertion.value).includes('hasUiTrajectory'),
);

describe('Codex Computer Use example', () => {
  it('submits empty form content for the allowlisted Computer Use approval', () => {
    expect(config.providers[0].config.server_request_policy.mcp_elicitation).toEqual({
      action: 'accept',
      content: {},
      allowed_server_names: ['computer-use'],
      allowed_messages: ['Allow Codex to use Promptfoo Computer Use Target?'],
    });
  });

  it('rejects a failed MCP trajectory even when the model returns the canary', async () => {
    expect(trajectoryAssertion).toBeDefined();
    const targetApp = '/tmp/PromptfooComputerUseTarget.app';
    const items = ['get_app_state', 'set_value', 'click', 'get_app_state'].map((tool, index) => ({
      type: 'mcpToolCall',
      server: 'computer-use',
      tool,
      arguments: { app: targetApp },
      status: 'failed',
      error: { message: 'Accessibility permission denied' },
      result: null,
      id: `failed-${index}`,
    }));

    const result = await runAssertion({
      assertion: trajectoryAssertion!,
      test: { vars: { target_app: targetApp } },
      providerResponse: {
        output: JSON.stringify({
          target: targetApp,
          observed_response: 'PROMPTFOO_UI_ONLY_CANARY_7F3A',
        }),
        metadata: { codexAppServer: { items } },
      },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'At least one computer-use MCP call did not complete successfully.',
    });
  });
});
