import { describe, expect, it } from 'vitest';
import {
  analyzeProbeResults,
  anthropicStrategy,
  azureOpenaiStrategy,
  genericStrategy,
  openaiStrategy,
} from '../../../src/redteam/configAgent/strategies';

import type { Probe, ProbeResult } from '../../../src/redteam/configAgent/types';

function probeResult({
  probe,
  status = 200,
  json,
  body,
  headers = {},
}: {
  probe: Probe;
  status?: number | null;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
}): ProbeResult {
  const responseBody = body ?? (json === undefined ? '' : JSON.stringify(json));
  return {
    probeId: probe.id,
    probe,
    status,
    headers,
    body: responseBody,
    json: json ?? null,
    timing: { total: 12 },
    error: null,
  };
}

describe('config agent discovery strategies', () => {
  it('returns null for unknown strategies and uninformative probe failures', () => {
    expect(analyzeProbeResults('missing', [])).toBeNull();
    expect(
      analyzeProbeResults('openai_compatible', [
        probeResult({ probe: openaiStrategy.probes[0], status: 404, body: 'not found' }),
      ]),
    ).toBeNull();
  });

  it('detects OpenAI-compatible responses and model lists', () => {
    const match = analyzeProbeResults('openai_compatible', [
      probeResult({
        probe: openaiStrategy.probes[0],
        json: { choices: [{ message: { content: 'hello' } }] },
      }),
      probeResult({
        probe: openaiStrategy.probes[1],
        json: { data: [{ id: 'gpt-test' }, { id: 'gpt-next' }] },
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'openai_compatible',
      confidence: 0.95,
      discoveredConfig: {
        apiType: 'openai_compatible',
        defaultModel: 'gpt-test',
        models: ['gpt-test', 'gpt-next'],
        transformResponse: 'json.choices[0].message.content',
      },
    });
    expect(match?.evidence).toContain('Response has choices array');
    expect(match?.evidence).toContain('Found 2 available models');
  });

  it('rejects malformed OpenAI, Anthropic, and Azure success responses', () => {
    expect(
      analyzeProbeResults('openai_compatible', [
        probeResult({ probe: openaiStrategy.probes[0], json: { output: 'hello' } }),
      ]),
    ).toBeNull();
    expect(
      analyzeProbeResults('anthropic_compatible', [
        probeResult({ probe: anthropicStrategy.probes[0], json: { output: 'hello' } }),
      ]),
    ).toBeNull();
    expect(
      analyzeProbeResults('azure_openai', [
        probeResult({ probe: azureOpenaiStrategy.probes[0], json: { output: 'hello' } }),
      ]),
    ).toBeNull();
  });

  it('detects Anthropic-compatible responses', () => {
    const match = analyzeProbeResults('anthropic_compatible', [
      probeResult({
        probe: anthropicStrategy.probes[0],
        json: { model: 'claude-test', content: [{ type: 'text', text: 'hello' }] },
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'anthropic_compatible',
      confidence: 0.95,
      discoveredConfig: {
        apiType: 'anthropic_compatible',
        defaultModel: 'claude-test',
        transformResponse: 'json.content[0].text',
      },
    });
    expect(match?.evidence).toContain('Response has content array');
    expect(match?.evidence).toContain('Response has text field in content');
  });

  it('detects Azure OpenAI responses', () => {
    const match = analyzeProbeResults('azure_openai', [
      probeResult({
        probe: azureOpenaiStrategy.probes[0],
        json: { choices: [{ message: { content: 'hello' } }] },
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'azure_openai',
      confidence: 0.9,
      discoveredConfig: {
        apiType: 'azure_openai',
        path: '/openai/deployments/{{model}}/chat/completions',
        transformResponse: 'json.choices[0].message.content',
      },
    });
  });

  it('builds partial configs from API-key auth errors', () => {
    const match = analyzeProbeResults('openai_compatible', [
      probeResult({
        probe: openaiStrategy.probes[0],
        status: 401,
        body: 'Missing API key. Send x-api-key header.',
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'openai_compatible',
      confidence: 0.6,
      discoveredConfig: {
        apiType: 'openai_compatible',
        auth: { type: 'api_key', location: 'header', headerName: 'X-API-Key' },
      },
    });
    expect(match?.evidence).toContain('Error mentions API key');
  });

  it('builds partial configs from bearer auth errors and WWW-Authenticate headers', () => {
    const match = analyzeProbeResults('anthropic_compatible', [
      probeResult({
        probe: anthropicStrategy.probes[0],
        status: 403,
        body: 'token required',
        headers: { 'www-authenticate': 'Bearer realm="api"' },
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'anthropic_compatible',
      discoveredConfig: {
        apiType: 'anthropic_compatible',
        auth: { type: 'bearer', location: 'header', headerName: 'Authorization' },
      },
    });
    expect(match?.evidence).toContain('WWW-Authenticate header indicates Bearer auth');
  });

  it('detects generic JSON response fields and preserves request shape', () => {
    const match = analyzeProbeResults('generic_json', [
      probeResult({
        probe: genericStrategy.probes[2],
        json: { metadata: { requestId: 'abc' }, response: { items: [{ text: 'hello' }] } },
      }),
    ]);

    expect(match).toMatchObject({
      strategyId: 'generic_json',
      confidence: 0.7,
      discoveredConfig: {
        apiType: 'generic_json',
        body: { input: '{{prompt}}' },
        transformResponse: 'json.response.items[0].text',
      },
    });
    expect(match?.evidence).toContain('Found response in field: json.response.items[0].text');
  });

  it('falls back to non-priority generic fields and ignores unusable values', () => {
    const match = analyzeProbeResults('generic_json', [
      probeResult({
        probe: genericStrategy.probes[0],
        json: { data: [{ nested: 'hello from fallback' }] },
      }),
    ]);
    expect(match?.discoveredConfig.transformResponse).toBe('json.data[0].nested');

    expect(
      analyzeProbeResults('generic_json', [
        probeResult({
          probe: genericStrategy.probes[0],
          json: { response: '', data: 'x'.repeat(10001) },
        }),
      ]),
    ).toBeNull();
  });
});
