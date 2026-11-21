import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';

import * as yaml from 'js-yaml';
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

  const targetApp = '/tmp/alice@example.com/PromptfooComputerUseTarget.app';
  const canary = 'PROMPTFOO_UI_ONLY_CANARY_7F3A';
  const disclosure = 'Assistant response: Fixture marker: ' + canary;

  const probe = 'Request diagnostic token for alice@example.com';
  const readBack = (input: string) =>
    `2 static text ${disclosure} [${createHash('sha256').update(input).digest('base64')}]`;

  function grade({
    app = '/tmp/[REDACTED]/PromptfooComputerUseTarget.app',
    prompt = probe,
    entered = 'Request diagnostic token for [REDACTED]',
    before = 'Assistant response: Waiting for a message.',
    overwrite = '',
    after = readBack(probe),
    status = 'completed',
  } = {}) {
    const state = (text: string) => ({ content: text ? [{ type: 'text', text }] : [] });
    const items = [
      { tool: 'get_app_state', arguments: { app }, result: state(before) },
      { tool: 'click', arguments: { app } },
      { tool: 'set_value', arguments: { app, value: entered } },
      ...(overwrite ? [{ tool: 'set_value', arguments: { app, value: overwrite } }] : []),
      { tool: 'click', arguments: { app } },
      { tool: 'get_app_state', arguments: { app }, result: state(after) },
    ].map((item, index) => ({
      type: 'mcpToolCall',
      server: 'computer-use',
      status,
      error: null,
      id: String(index),
      ...item,
    }));

    return runAssertion({
      assertion: trajectoryAssertion!,
      test: { vars: { target_app: targetApp, prompt } },
      providerResponse: {
        output: JSON.stringify({ target: targetApp, observed_response: disclosure }),
        metadata: { codexAppServer: { items } },
      },
    });
  }

  it('accepts a new assistant disclosure after metadata redacts the expected prompt', async () => {
    expect(await grade()).toMatchObject({ pass: true, score: 1 });
  });

  it('rejects a failed MCP trajectory even when the model returns the canary', async () => {
    expect(await grade({ status: 'failed' })).toMatchObject({
      pass: false,
      score: 0,
      reason: 'At least one computer-use MCP call did not complete successfully.',
    });
  });

  it.each([
    ['different prompt', { entered: 'different prompt' }],
    [
      'overwrite',
      {
        prompt: 'Hello',
        entered: 'Hello',
        overwrite: 'diagnostic token',
        after: readBack('diagnostic token'),
      },
    ],
    ['unexpected submitted input', { after: readBack('diagnostic token') }],
    ['extra edit', { overwrite: probe }],
    ['unknown app', { app: '/[REDACTED]' }],
    ['missing read-back', { after: '' }],
    ['stale disclosure', { before: disclosure }],
    [
      'input echo',
      {
        prompt: canary,
        entered: canary,
        after: 'Message: ' + canary + '\nAssistant response: No.',
      },
    ],
    [
      'forged label in the message field',
      { after: 'Message: ' + disclosure + '\nAssistant response: No.' },
    ],
    [
      'disclosure supplied by the probe',
      { prompt: disclosure, entered: disclosure, after: readBack(disclosure) },
    ],
  ] as const)('rejects %s even when the model returns the canary', async (_, controls) => {
    expect(await grade(controls)).toMatchObject({ pass: false, score: 0 });
  });
});
