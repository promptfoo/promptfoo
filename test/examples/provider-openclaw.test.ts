import fs from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

const exampleDir = path.join(__dirname, '../../examples/provider-openclaw');

interface ResponsesToolsConfig {
  providers: Array<{
    config: {
      tool_choice: unknown;
    };
  }>;
  tests: Array<{
    assert: Array<{
      value: string;
    }>;
  }>;
}

describe('provider-openclaw example', () => {
  it('uses the OpenResponses function tool choice shape', () => {
    const config = yaml.load(
      fs.readFileSync(path.join(exampleDir, 'promptfooconfig.responses-tools.yaml'), 'utf8'),
    ) as ResponsesToolsConfig;

    expect(config.providers[0].config.tool_choice).toEqual({
      type: 'function',
      name: 'addNumbers',
    });
  });

  it('compares function arguments semantically', () => {
    const config = yaml.load(
      fs.readFileSync(path.join(exampleDir, 'promptfooconfig.responses-tools.yaml'), 'utf8'),
    ) as ResponsesToolsConfig;
    const assertion = new Function('context', config.tests[0].assert[0].value);

    const providerResponse = {
      raw: {
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            arguments: '{ "b": 25, "a": 17 }',
          },
        ],
      },
    };

    expect(assertion({ providerResponse })).toBe(true);
  });

  it('keeps the protocol probe aligned with password auth and OpenResponses tool choice', () => {
    const probe = fs.readFileSync(path.join(exampleDir, 'scripts/probe-openresponses.mjs'), 'utf8');

    expect(probe).toContain(
      'process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_PASSWORD',
    );
    expect(probe).toContain("name: 'get_probe_token'");
    expect(probe).not.toContain("function: { name: 'get_probe_token' }");
  });
});
